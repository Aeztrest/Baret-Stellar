#![no_std]

//! BARET MerchantSpendPolicy — an on-chain, per-merchant spending policy for
//! passkey-kit smart wallets (see `docs/x402-defense.md` §10/§11).
//!
//! This closes the gap flagged in a repo review: the extension's per-merchant
//! "sub-key" (`apps/extension/src/background/swig/sub-keys.ts`) used to be
//! registered on the smart wallet with an unlimited allowance, so a leaked
//! sub-key had no on-chain ceiling at all. With this policy, a sub-key is
//! instead registered as an `Ed25519` signer whose `SignerLimits` scope it to
//! ONE token contract, requiring this policy's approval for every use
//! (`limits = {token: [SignerKey::Policy(this_contract)]}`). A leaked sub-key
//! can therefore never authorize anything this policy — and the wallet's own
//! `SignerLimits` enforcement (`smart-wallet`'s `context.rs`) — doesn't
//! explicitly allow, and every `transfer` it does authorize is capped exactly
//! as configured per merchant here.
//!
//! Design note (defense in depth): the sub-key's own Ed25519 signature is
//! still required alongside this policy (see `SignerLimits` above) — this
//! policy is a required CO-signer, never the sole `Signature::Policy` entry
//! for a value transfer. `smart-wallet-interface`'s own `PolicyInterface` doc
//! is explicit that a value-moving policy used *alone* is secretless (anyone
//! can submit `Signature::Policy`) and must therefore be a bounded,
//! cumulative allowance — which this is too, but pairing it with a real
//! cryptographic signer closes the "anyone can spend up to the cap" gap
//! entirely: without the sub-key's private key, nobody can trigger a payment
//! at all, capped or not.
//!
//! Multi-tenant, no owner/init: unlike `PaymentGuard` (one deployed instance
//! per user's vault), one deployment of this policy serves every wallet that
//! installs it — storage is keyed by `(wallet, merchant)`, and every
//! wallet-scoped admin call (`set_allowance`/`pause`/`resume`/`revoke`)
//! requires that wallet's own auth, not a single contract owner. This also
//! means the policy isn't pinned to one token the way `PaymentGuard` is —
//! the wallet's own `SignerLimits` already scope which contract a sub-key may
//! touch, so the same deployed policy can back sub-keys for USDC, or any
//! other SEP-41 token, across every wallet that uses it.
//!
//! Allowance semantics mirror `contracts/contracts/payment-guard`'s
//! `Allowance` (cap-per-tx, true sliding-window cap-per-day, mandate expiry,
//! pause/resume/revoke) — that contract's model is already written, tested,
//! and reasoned about; this reuses it rather than inventing a second one.
//! The `policy__` deny-by-default / single-charge-accounting / TTL-renewal
//! implementation follows `sample-policy` (the passkey-kit reference
//! implementation this crate's `smart_wallet_interface` module is vendored
//! alongside) function-for-function, extended from a single global cap to a
//! per-(wallet, merchant) one.

mod smart_wallet_interface;

use smart_wallet_interface::{types::SignerKey, PolicyInterface, SmartWalletClient};
use soroban_sdk::{
    auth::{Context, ContractContext},
    contract, contractevent, contracterror, contractimpl, contracttype, panic_with_error,
    symbol_short, vec, Address, Env, TryFromVal, Vec,
};

const DAY_SECONDS: u64 = 86_400;

/// TTL renewal parameters (in ledgers at the historical 5s close time): bump
/// to ~30 days whenever remaining TTL drops below ~1 week. Mirrors
/// `sample-policy`'s renewal constants.
const RENEW_THRESHOLD: u32 = 60 * 60 * 24 / 5 * 7;
const RENEW_TO: u32 = 60 * 60 * 24 / 5 * 30;

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
    /// trailing 24h window. True sliding window, same rationale as
    /// `PaymentGuard::Allowance::spend_log`.
    pub spend_log: Vec<(u64, i128)>,
    pub status: Status,
    /// Ledger timestamp this mandate lapses at. `set_allowance` must be
    /// called again (a fresh, explicit grant by the wallet) to renew it.
    pub expires_at: u64,
}

#[contracttype]
pub enum DataKey {
    /// Wallets that currently have this policy installed as a signer.
    Installed(Address),
    /// (wallet, merchant) -> Allowance.
    Allowance(Address, Address),
}

/// Emitted whenever a wallet grants or renews a merchant's caps.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowanceSet {
    #[topic]
    pub wallet: Address,
    #[topic]
    pub merchant: Address,
    pub cap_per_tx: i128,
    pub cap_per_day: i128,
}

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Error {
    NotInstalled = 1,
    StillInstalled = 2,
    NoAllowance = 3,
    NotActive = 4,
    ExceedsPerTx = 5,
    ExceedsDailyCap = 6,
    InvalidAmount = 7,
    MandateExpired = 8,
    /// Deny-by-default catch-all: a non-`transfer` invocation, a context
    /// shaped unexpectedly, a `transfer` not FROM the wallet itself, or one
    /// whose `to` has no allowance recorded.
    NotAllowed = 9,
}

#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    /// Grant or update a merchant's caps for `wallet`. Requires `wallet`'s
    /// own auth (this is a multi-tenant contract — there is no single
    /// "owner" of the whole deployment, each wallet administers only its own
    /// entries). Resets the merchant to `Active`, starts a fresh rolling
    /// window, and grants a mandate valid for `mandate_seconds` from now.
    pub fn set_allowance(
        env: Env,
        wallet: Address,
        merchant: Address,
        cap_per_tx: i128,
        cap_per_day: i128,
        mandate_seconds: u64,
    ) {
        wallet.require_auth();
        if cap_per_tx <= 0 || cap_per_day <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let key = DataKey::Allowance(wallet.clone(), merchant.clone());
        let allowance = Allowance {
            cap_per_tx,
            cap_per_day,
            spend_log: vec![&env],
            status: Status::Active,
            expires_at: env.ledger().timestamp().saturating_add(mandate_seconds),
        };
        env.storage().persistent().set(&key, &allowance);
        renew_persistent(&env, &key);

        AllowanceSet {
            wallet,
            merchant,
            cap_per_tx,
            cap_per_day,
        }
        .publish(&env);
    }

    pub fn pause(env: Env, wallet: Address, merchant: Address) {
        Self::set_status(&env, &wallet, &merchant, Status::Paused);
    }

    pub fn resume(env: Env, wallet: Address, merchant: Address) {
        Self::set_status(&env, &wallet, &merchant, Status::Active);
    }

    pub fn revoke(env: Env, wallet: Address, merchant: Address) {
        Self::set_status(&env, &wallet, &merchant, Status::Revoked);
    }

    /* ───────────── views ───────────── */

    pub fn get_allowance(env: Env, wallet: Address, merchant: Address) -> Allowance {
        env.storage()
            .persistent()
            .get(&DataKey::Allowance(wallet, merchant))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NoAllowance))
    }

    /// Remaining spendable amount for a merchant in the trailing 24h window.
    /// Read-only: does not persist the pruned log.
    pub fn available_today(env: Env, wallet: Address, merchant: Address) -> i128 {
        let mut allowance: Allowance = env
            .storage()
            .persistent()
            .get(&DataKey::Allowance(wallet, merchant))
            .unwrap_or_else(|| panic_with_error!(&env, Error::NoAllowance));
        let now = env.ledger().timestamp();
        let spent = prune_and_sum(&env, &mut allowance.spend_log, now);
        let remaining = allowance.cap_per_day - spent;
        if remaining < 0 {
            0
        } else {
            remaining
        }
    }

    /* ───────────── internals ───────────── */

    fn set_status(env: &Env, wallet: &Address, merchant: &Address, status: Status) {
        wallet.require_auth();
        let key = DataKey::Allowance(wallet.clone(), merchant.clone());
        let mut allowance: Allowance = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(env, Error::NoAllowance));
        allowance.status = status;
        env.storage().persistent().set(&key, &allowance);
        renew_persistent(env, &key);
    }
}

#[contractimpl]
impl PolicyInterface for Contract {
    fn install(env: Env, wallet: Address) {
        // The wallet is the direct invoker during add_signer; invoker auth.
        wallet.require_auth();

        let key = DataKey::Installed(wallet);
        env.storage().persistent().set::<DataKey, bool>(&key, &true);
        renew_instance(&env);
        renew_persistent(&env, &key);
    }

    fn uninstall(env: Env, wallet: Address) {
        // Permissionless self-clean: only clear state once this policy is
        // genuinely no longer a signer on `wallet`, so a griefer cannot wipe
        // state for a wallet where it's still installed.
        let still_signer = SmartWalletClient::new(&env, &wallet)
            .get_signer(&SignerKey::Policy(env.current_contract_address()))
            .is_some();
        if still_signer {
            panic_with_error!(&env, Error::StillInstalled);
        }

        env.storage()
            .persistent()
            .remove::<DataKey>(&DataKey::Installed(wallet));
        // Note: per-merchant Allowance entries for this wallet are
        // deliberately NOT swept here — uninstall doesn't know the full set
        // of merchants a wallet ever granted, and leaving them is harmless
        // (policy__ requires Installed(wallet) to be set at all, so a
        // stale Allowance is simply inert dead storage until it expires off
        // its own TTL).
    }

    fn policy__(env: Env, source: Address, _signer: SignerKey, contexts: Vec<Context>) {
        // `source` is the wallet. Caller-authenticated per PolicyInterface's
        // requirement for any state-committing policy: satisfied by invoker
        // auth when the wallet itself is the direct caller (the real path,
        // during __check_auth); an external spoofed caller cannot satisfy it
        // for a wallet it doesn't control.
        source.require_auth();

        let installed_key = DataKey::Installed(source.clone());
        if !env.storage().persistent().has::<DataKey>(&installed_key) {
            panic_with_error!(&env, Error::NotInstalled);
        }

        // Deny-by-default: exactly one context, a `transfer` FROM the
        // wallet itself, with a positive i128 amount. Anything else — wrong
        // function, wrong shape, multiple contexts, the wallet's own admin
        // surface — rejects.
        if contexts.len() != 1 {
            panic_with_error!(&env, Error::NotAllowed);
        }
        let context = contexts.get_unchecked(0);
        let (merchant, amount) = match context {
            Context::Contract(ContractContext {
                contract,
                fn_name,
                args,
            }) => {
                if contract == source {
                    panic_with_error!(&env, Error::NotAllowed);
                }
                if fn_name != symbol_short!("transfer") {
                    panic_with_error!(&env, Error::NotAllowed);
                }

                let from = args
                    .get(0)
                    .and_then(|v| Address::try_from_val(&env, &v).ok());
                if from != Some(source.clone()) {
                    panic_with_error!(&env, Error::NotAllowed);
                }

                let merchant = match args.get(1).and_then(|v| Address::try_from_val(&env, &v).ok()) {
                    Some(m) => m,
                    None => panic_with_error!(&env, Error::NotAllowed),
                };
                let amount = match args.get(2).and_then(|v| i128::try_from_val(&env, &v).ok()) {
                    Some(a) if a > 0 => a,
                    _ => panic_with_error!(&env, Error::NotAllowed),
                };
                (merchant, amount)
            }
            _ => panic_with_error!(&env, Error::NotAllowed),
        };

        let key = DataKey::Allowance(source.clone(), merchant);
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

        let spent = prune_and_sum(&env, &mut allowance.spend_log, now);
        let projected = spent
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::InvalidAmount));
        if projected > allowance.cap_per_day {
            panic_with_error!(&env, Error::ExceedsDailyCap);
        }

        // Single-charge accounting: commit only after every check above has
        // passed, and only once per policy__ invocation (this function
        // never loops over multiple candidate contexts — see the
        // `contexts.len() != 1` guard above).
        allowance.spend_log.push_back((now, amount));
        env.storage().persistent().set(&key, &allowance);

        renew_instance(&env);
        renew_persistent(&env, &installed_key);
        renew_persistent(&env, &key);
    }
}

/// Drop every log entry older than the trailing 24h window and return the
/// sum of what remains. Same true-sliding-window rationale as
/// `PaymentGuard::prune_and_sum`.
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

fn renew_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(RENEW_THRESHOLD, RENEW_TO);
}

fn renew_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl::<DataKey>(key, RENEW_THRESHOLD, RENEW_TO);
}

mod test;
