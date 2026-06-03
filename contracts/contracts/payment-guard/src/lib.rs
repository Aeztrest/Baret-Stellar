#![no_std]

//! BLACKTHORN PaymentGuard — an on-chain spending-limit vault for x402 / agentic
//! micropayments on Soroban.
//!
//! This is the on-chain counterpart of BLACKTHORN's off-chain x402 firewall
//! (see `packages/swig-guard`): the wallet owner deposits a token (e.g. USDC)
//! and grants each merchant a per-transaction cap plus a rolling 24-hour cap.
//! An agent can then call [`PaymentGuard::pay`] to settle payments **without the
//! owner signing each one** — the caps ARE the firewall. Payments above a cap,
//! to an unregistered merchant, or to a paused/revoked merchant are rejected
//! on-chain.
//!
//! Functions:
//!   - `init(owner, token)`              — one-time setup.
//!   - `deposit(from, amount)`           — fund the vault (caller signs).
//!   - `set_allowance(m, per_tx, daily)` — owner grants/updates a merchant cap.
//!   - `pause / resume / revoke(m)`      — owner toggles a merchant.
//!   - `pay(merchant, amount)`           — agentic spend, enforced by caps.
//!   - `withdraw(amount)`                — owner pulls funds back out.
//!   - views: `get_owner`, `get_token`, `get_allowance`, `available_today`.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
    Symbol,
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
    /// Cumulative spend allowed per rolling 24h window (atomic units).
    pub cap_per_day: i128,
    /// Spend recorded in the current rolling window.
    pub spent_day: i128,
    /// Ledger timestamp the current rolling window started.
    pub day_start: u64,
    pub status: Status,
}

#[contracttype]
pub enum DataKey {
    Owner,
    Token,
    Allowance(Address),
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
}

#[contract]
pub struct PaymentGuard;

#[contractimpl]
impl PaymentGuard {
    /// One-time setup: record the owning wallet and the token (SAC address,
    /// e.g. USDC `C…`) this vault spends in.
    pub fn init(env: Env, owner: Address, token: Address) {
        let store = env.storage().instance();
        if store.has(&DataKey::Owner) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        store.set(&DataKey::Owner, &owner);
        store.set(&DataKey::Token, &token);
    }

    /// Grant or update a merchant's caps. Owner-authorized. Resets the merchant
    /// to `Active` and starts a fresh rolling window.
    pub fn set_allowance(env: Env, merchant: Address, cap_per_tx: i128, cap_per_day: i128) {
        Self::require_owner(&env);
        if cap_per_tx < 0 || cap_per_day < 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let allowance = Allowance {
            cap_per_tx,
            cap_per_day,
            spent_day: 0,
            day_start: env.ledger().timestamp(),
            status: Status::Active,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Allowance(merchant.clone()), &allowance);
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

    /// Agentic spend. **No owner signature required** — the per-tx and rolling
    /// daily caps the owner set are the firewall. Reverts if the merchant is
    /// unregistered, paused/revoked, or the payment would breach a cap.
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
        if amount > allowance.cap_per_tx {
            panic_with_error!(&env, Error::ExceedsPerTx);
        }

        // Roll the 24h window forward if it has elapsed.
        let now = env.ledger().timestamp();
        if now.saturating_sub(allowance.day_start) >= DAY_SECONDS {
            allowance.spent_day = 0;
            allowance.day_start = now;
        }
        if allowance.spent_day + amount > allowance.cap_per_day {
            panic_with_error!(&env, Error::ExceedsDailyCap);
        }

        // Settle from the vault to the merchant, then record the spend.
        let token = Self::token(&env);
        token::TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &merchant,
            &amount,
        );
        allowance.spent_day += amount;
        env.storage().persistent().set(&key, &allowance);

        env.events()
            .publish((Symbol::new(&env, "paid"), merchant), amount);
    }

    /// Owner pulls funds back out of the vault.
    pub fn withdraw(env: Env, amount: i128) {
        let owner = Self::require_owner(&env);
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let token = Self::token(&env);
        token::TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &owner,
            &amount,
        );
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

    /// Remaining spendable amount for a merchant in the current window, after
    /// applying any pending rolling-window reset.
    pub fn available_today(env: Env, merchant: Address) -> i128 {
        let allowance: Allowance = env
            .storage()
            .persistent()
            .get(&DataKey::Allowance(merchant))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NoAllowance));
        let now = env.ledger().timestamp();
        let spent = if now.saturating_sub(allowance.day_start) >= DAY_SECONDS {
            0
        } else {
            allowance.spent_day
        };
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
        allowance.status = status;
        env.storage().persistent().set(&key, &allowance);
    }
}

mod test;
