#![no_std]

//! BARET PaymentGuard — an on-chain spending-limit vault for x402 / agentic
//! micropayments on Soroban.
//!
//! This is the on-chain counterpart of BARET's off-chain x402 firewall
//! (see `packages/swig-guard`): the wallet owner deposits a token (e.g. USDC)
//! and grants each merchant a per-transaction cap, a rolling 24-hour cap, and
//! a bounded mandate lifetime. An agent can then call [`PaymentGuard::pay`] to
//! settle payments **without the owner signing each one** — but only while a
//! live mandate exists. The caps bound how much; `expires_at` bounds how long;
//! neither one is a substitute for the owner's original `set_allowance` grant.
//! Payments above a cap, past the mandate's expiry, to an unregistered
//! merchant, or to a paused/revoked merchant are rejected on-chain.
//!
//! Functions:
//!   - `init(owner, token)`                          — one-time setup.
//!   - `deposit(from, amount)`                        — fund the vault (caller signs).
//!   - `set_allowance(m, per_tx, daily, mandate_secs)` — owner grants/renews a merchant mandate.
//!   - `pause / resume / revoke(m)`                   — owner toggles a merchant.
//!   - `pay(merchant, amount)`                        — agentic spend, enforced by caps + expiry.
//!   - `withdraw(amount)`                             — owner pulls funds back out.
//!   - views: `get_owner`, `get_token`, `get_allowance`, `available_today`.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, vec, Address,
    Env, Symbol, Vec,
};

const DAY_SECONDS: u64 = 86_400;

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Active = 0,
    Paused = 1,
    Revoked = 2,
}

#[contracttype]
#[derive(Clone)]
pub struct Allowance {
    /// Largest single payment allowed to this merchant (atomic units).
    pub cap_per_tx: i128,
    /// Cumulative spend allowed per any trailing 24h window (atomic units).
    pub cap_per_day: i128,
    /// (ledger_timestamp, amount) of every settled payment still inside the
    /// trailing 24h window. Pruned on every `pay` so the cap is enforced
    /// against a true sliding window, not a fixed bucket that can be spent
    /// twice by timing a payment just before and just after a reset boundary.
    pub spend_log: Vec<(u64, i128)>,
    pub status: Status,
    /// Ledger timestamp this mandate lapses at. The cap alone is never
    /// authorization on its own — `set_allowance` always grants a bounded
    /// lifetime, and `pay` refuses once it's passed. The owner must call
    /// `set_allowance` again (a fresh, explicit grant) to renew it.
    pub expires_at: u64,
}

#[contracttype]
pub enum DataKey {
    Owner,
    Token,
    Allowance(Address),
    /// Sum of `cap_per_day` across every currently-`Active` merchant — the
    /// worst-case amount the vault could owe out in the next 24h. `withdraw`
    /// refuses to pull the balance below this, so an owner can't quietly
    /// zero the vault while merchants still hold caps that look funded.
    TotalReserved,
}

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NoAllowance = 3,
    NotActive = 4,
    ExceedsPerTx = 5,
    ExceedsDailyCap = 6,
    InvalidAmount = 7,
    InsufficientReserve = 8,
    MandateExpired = 9,
}

#[contract]
pub struct PaymentGuard;

#[contractimpl]
impl PaymentGuard {
    /// One-time setup: record the owning wallet and the token (SAC address,
    /// e.g. USDC `C…`) this vault spends in. Must be authorized by `owner`
    /// itself, otherwise anyone who front-runs the deploy transaction could
    /// call `init` with themselves as owner and permanently lock out the
    /// real owner (who would then hit `AlreadyInitialized`).
    pub fn init(env: Env, owner: Address, token: Address) {
        owner.require_auth();
        let store = env.storage().instance();
        if store.has(&DataKey::Owner) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        store.set(&DataKey::Owner, &owner);
        store.set(&DataKey::Token, &token);
    }

    /// Grant or update a merchant's caps. Owner-authorized. Resets the merchant
    /// to `Active`, starts a fresh rolling window, and grants a mandate valid
    /// for `mandate_seconds` from now — the caps bound *how much* per payment
    /// and per day, `mandate_seconds` bounds *how long* this authorization
    /// stands before the owner must explicitly renew it.
    pub fn set_allowance(
        env: Env,
        merchant: Address,
        cap_per_tx: i128,
        cap_per_day: i128,
        mandate_seconds: u64,
    ) {
        Self::require_owner(&env);
        if cap_per_tx < 0 || cap_per_day < 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let key = DataKey::Allowance(merchant.clone());
        let previous: Option<Allowance> = env.storage().persistent().get(&key);
        let previous_reserved = match &previous {
            Some(a) if a.status == Status::Active => a.cap_per_day,
            _ => 0,
        };

        let allowance = Allowance {
            cap_per_tx,
            cap_per_day,
            spend_log: vec![&env],
            status: Status::Active,
            expires_at: env.ledger().timestamp().saturating_add(mandate_seconds),
        };
        env.storage().persistent().set(&key, &allowance);
        Self::adjust_reserve(&env, cap_per_day - previous_reserved);

        env.events().publish(
            (Symbol::new(&env, "allowance_set"), merchant),
            (cap_per_tx, cap_per_day),
        );
    }

    pub fn pause(env: Env, merchant: Address) {
        Self::set_status(&env, &merchant, Status::Paused);
    }

    pub fn resume(env: Env, merchant: Address) {
        Self::set_status(&env, &merchant, Status::Active);
    }

    pub fn revoke(env: Env, merchant: Address) {
        Self::set_status(&env, &merchant, Status::Revoked);
    }

    /// Fund the vault. The caller authorizes a token transfer into the contract.
    pub fn deposit(env: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let token = Self::token(&env);
        token::TokenClient::new(&env, &token).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );
    }

    /// Agentic spend. **No owner signature required** — enforced instead by
    /// the per-tx cap, the rolling daily cap, and the mandate's expiry, all
    /// set by the owner's `set_allowance` call. Reverts if the merchant is
    /// unregistered, paused/revoked, the mandate has expired, or the payment
    /// would breach a cap.
    pub fn pay(env: Env, merchant: Address, amount: i128) {
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let key = DataKey::Allowance(merchant.clone());
        let mut allowance: Allowance = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NoAllowance));

        if allowance.status != Status::Active {
            panic_with_error!(&env, Error::NotActive);
        }
        let now = env.ledger().timestamp();
        if now > allowance.expires_at {
            panic_with_error!(&env, Error::MandateExpired);
        }
        if amount > allowance.cap_per_tx {
            panic_with_error!(&env, Error::ExceedsPerTx);
        }

        // True sliding window: prune every entry older than 24h, then sum
        // what's left. Unlike a fixed bucket that resets to zero the moment
        // it elapses, this can never be spent twice by timing a payment
        // right before and right after a reset boundary.
        let spent = Self::prune_and_sum(&env, &mut allowance.spend_log, now);
        let projected = spent
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::InvalidAmount));
        if projected > allowance.cap_per_day {
            panic_with_error!(&env, Error::ExceedsDailyCap);
        }

        // Checks-effects-interactions: commit the spend to persistent
        // storage *before* the external token transfer, so a reentrant call
        // into `pay` (via a token/merchant callback) reads the up-to-date
        // spend log rather than a stale one that would let the cap be
        // checked twice against the same balance.
        allowance.spend_log.push_back((now, amount));
        env.storage().persistent().set(&key, &allowance);

        let token = Self::token(&env);
        token::TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &merchant,
            &amount,
        );

        env.events()
            .publish((Symbol::new(&env, "paid"), merchant), amount);
    }

    /// Owner pulls funds back out of the vault. Reverts if it would leave
    /// the vault unable to cover the full daily cap of every currently
    /// active merchant — reduce or revoke their allowances first.
    pub fn withdraw(env: Env, amount: i128) {
        let owner = Self::require_owner(&env);
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let token = Self::token(&env);
        let token_client = token::TokenClient::new(&env, &token);
        let balance = token_client.balance(&env.current_contract_address());
        let reserved = Self::total_reserved(&env);
        let remaining = balance
            .checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::InvalidAmount));
        if remaining < reserved {
            panic_with_error!(&env, Error::InsufficientReserve);
        }
        token_client.transfer(&env.current_contract_address(), &owner, &amount);
    }

    /* ───────────── views ───────────── */

    pub fn get_owner(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Owner)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized))
    }

    pub fn get_token(env: Env) -> Address {
        Self::token(&env)
    }

    pub fn get_allowance(env: Env, merchant: Address) -> Allowance {
        env.storage()
            .persistent()
            .get(&DataKey::Allowance(merchant))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NoAllowance))
    }

    /// Remaining spendable amount for a merchant in the trailing 24h window.
    /// Read-only: does not persist the pruned log (only `pay` does that).
    pub fn available_today(env: Env, merchant: Address) -> i128 {
        let mut allowance: Allowance = env
            .storage()
            .persistent()
            .get(&DataKey::Allowance(merchant))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NoAllowance));
        let now = env.ledger().timestamp();
        let spent = Self::prune_and_sum(&env, &mut allowance.spend_log, now);
        let remaining = allowance.cap_per_day - spent;
        if remaining < 0 {
            0
        } else {
            remaining
        }
    }

    /* ───────────── internals ───────────── */

    fn require_owner(env: &Env) -> Address {
        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized));
        owner.require_auth();
        owner
    }

    fn token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn set_status(env: &Env, merchant: &Address, status: Status) {
        Self::require_owner(env);
        let key = DataKey::Allowance(merchant.clone());
        let mut allowance: Allowance = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(env, Error::NoAllowance));
        let was_active = allowance.status == Status::Active;
        let will_be_active = status == Status::Active;
        allowance.status = status;
        env.storage().persistent().set(&key, &allowance);
        if was_active && !will_be_active {
            Self::adjust_reserve(env, -allowance.cap_per_day);
        } else if !was_active && will_be_active {
            Self::adjust_reserve(env, allowance.cap_per_day);
        }
    }

    fn total_reserved(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalReserved)
            .unwrap_or(0)
    }

    fn adjust_reserve(env: &Env, delta: i128) {
        let updated = Self::total_reserved(env)
            .checked_add(delta)
            .unwrap_or_else(|| panic_with_error!(env, Error::InvalidAmount));
        env.storage().instance().set(&DataKey::TotalReserved, &updated);
    }

    /// Drop every log entry older than the trailing 24h window and return
    /// the sum of what remains. Uses `checked_add` so a pathologically long
    /// log can never silently wrap the running total instead of erroring.
    fn prune_and_sum(env: &Env, log: &mut Vec<(u64, i128)>, now: u64) -> i128 {
        let mut kept: Vec<(u64, i128)> = vec![env];
        let mut sum: i128 = 0;
        for (ts, amount) in log.iter() {
            if now.saturating_sub(ts) < DAY_SECONDS {
                kept.push_back((ts, amount));
                sum = sum
                    .checked_add(amount)
                    .unwrap_or_else(|| panic_with_error!(env, Error::InvalidAmount));
            }
        }
        *log = kept;
        sum
    }
}

mod test;
