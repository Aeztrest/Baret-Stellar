#![cfg(test)]

use super::*;
use smart_wallet_interface::types::{SignerExpiration, SignerLimits, SignerVal};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, EnvTestConfig, Events, Ledger},
    Address, BytesN, Env, IntoVal, Symbol,
};

const MANDATE_SECS: u64 = 30 * DAY_SECONDS;

struct Fixture<'a> {
    env: Env,
    policy: ContractClient<'a>,
    wallet: Address,
    merchant: Address,
}

fn setup<'a>() -> Fixture<'a> {
    setup_in(Env::default())
}

fn setup_in<'a>(env: Env) -> Fixture<'a> {
    env.mock_all_auths();

    let wallet = Address::generate(&env);
    let merchant = Address::generate(&env);

    let policy_id = env.register(Contract, ());
    let policy = ContractClient::new(&env, &policy_id);
    policy.install(&wallet);

    Fixture {
        env,
        policy,
        wallet,
        merchant,
    }
}

/// Builds the exact `Context::Contract` a smart wallet would pass to
/// `policy__` for `token.transfer(wallet, merchant, amount)` — the only
/// shape `policy__` ever approves.
fn transfer_context(
    env: &Env,
    token: &Address,
    from: &Address,
    to: &Address,
    amount: i128,
) -> Context {
    Context::Contract(ContractContext {
        contract: token.clone(),
        fn_name: symbol_short!("transfer"),
        args: (from.clone(), to.clone(), amount).into_val(env),
    })
}

/// A deterministic 32-byte Ed25519 public key for tests, distinguished by
/// `tag` so a test can build two DIFFERENT signers (e.g. "the sub-key
/// merchant A's allowance was granted to" vs. "merchant B's sub-key").
fn signer_bytes(env: &Env, tag: u8) -> BytesN<32> {
    BytesN::from_array(env, &[tag; 32])
}

fn signer_key(env: &Env, tag: u8) -> SignerKey {
    SignerKey::Ed25519(signer_bytes(env, tag))
}

#[test]
fn transfer_within_caps_settles_and_records_spend() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy.set_allowance(
        &f.wallet,
        &f.merchant,
        &signer_bytes(&f.env, 1),
        &10_000,
        &30_000,
        &MANDATE_SECS,
    );

    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 10_000);
    f.policy.policy__(
        &f.wallet,
        &signer_key(&f.env, 1),
        &soroban_sdk::vec![&f.env, ctx],
    );

    assert_eq!(f.policy.available_today(&f.wallet, &f.merchant), 20_000);
}

#[test]
#[should_panic] // WrongSigner
fn transfer_with_wrong_signer_reverts() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy.set_allowance(
        &f.wallet,
        &f.merchant,
        &signer_bytes(&f.env, 1),
        &10_000,
        &30_000,
        &MANDATE_SECS,
    );

    // A DIFFERENT sub-key (e.g. one provisioned for another merchant on the
    // same wallet) attempting to spend against this merchant's allowance.
    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 1_000);
    f.policy.policy__(
        &f.wallet,
        &signer_key(&f.env, 2),
        &soroban_sdk::vec![&f.env, ctx],
    );
}

#[test]
#[should_panic] // ExceedsPerTx
fn transfer_above_per_tx_cap_reverts() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy.set_allowance(
        &f.wallet,
        &f.merchant,
        &signer_bytes(&f.env, 1),
        &10_000,
        &30_000,
        &MANDATE_SECS,
    );

    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 10_001);
    f.policy.policy__(
        &f.wallet,
        &signer_key(&f.env, 1),
        &soroban_sdk::vec![&f.env, ctx],
    );
}

#[test]
#[should_panic] // ExceedsDailyCap
fn cumulative_spend_past_daily_cap_reverts() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy.set_allowance(
        &f.wallet,
        &f.merchant,
        &signer_bytes(&f.env, 1),
        &10_000,
        &25_000,
        &MANDATE_SECS,
    );

    for _ in 0..2 {
        let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 10_000);
        f.policy.policy__(
            &f.wallet,
            &signer_key(&f.env, 1),
            &soroban_sdk::vec![&f.env, ctx],
        );
    }
    // 20_000 spent so far — this third payment would push it to 30_000 > 25_000.
    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 10_000);
    f.policy.policy__(
        &f.wallet,
        &signer_key(&f.env, 1),
        &soroban_sdk::vec![&f.env, ctx],
    );
}

#[test]
fn rolling_window_resets_after_24h() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy.set_allowance(
        &f.wallet,
        &f.merchant,
        &signer_bytes(&f.env, 1),
        &10_000,
        &10_000,
        &MANDATE_SECS,
    );

    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 10_000);
    f.policy.policy__(
        &f.wallet,
        &signer_key(&f.env, 1),
        &soroban_sdk::vec![&f.env, ctx.clone()],
    );
    assert_eq!(f.policy.available_today(&f.wallet, &f.merchant), 0);

    f.env.ledger().with_mut(|l| l.timestamp += DAY_SECONDS + 1);

    // A day later the sliding window has fully rolled off — full cap again.
    f.policy.policy__(
        &f.wallet,
        &signer_key(&f.env, 1),
        &soroban_sdk::vec![&f.env, ctx],
    );
    assert_eq!(f.policy.available_today(&f.wallet, &f.merchant), 0);
}

#[test]
#[should_panic] // NoAllowance
fn transfer_to_unregistered_merchant_reverts() {
    let f = setup();
    let token = Address::generate(&f.env);
    let stranger = Address::generate(&f.env);
    let ctx = transfer_context(&f.env, &token, &f.wallet, &stranger, 1);
    f.policy.policy__(
        &f.wallet,
        &signer_key(&f.env, 1),
        &soroban_sdk::vec![&f.env, ctx],
    );
}

#[test]
#[should_panic] // NotActive
fn transfer_to_revoked_merchant_reverts() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy.set_allowance(
        &f.wallet,
        &f.merchant,
        &signer_bytes(&f.env, 1),
        &10_000,
        &30_000,
        &MANDATE_SECS,
    );
    f.policy.revoke(&f.wallet, &f.merchant);

    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 1_000);
    f.policy.policy__(
        &f.wallet,
        &signer_key(&f.env, 1),
        &soroban_sdk::vec![&f.env, ctx],
    );
}

#[test]
fn pause_then_resume_restores_spend() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy.set_allowance(
        &f.wallet,
        &f.merchant,
        &signer_bytes(&f.env, 1),
        &10_000,
        &30_000,
        &MANDATE_SECS,
    );
    f.policy.pause(&f.wallet, &f.merchant);
    f.policy.resume(&f.wallet, &f.merchant);

    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 5_000);
    f.policy.policy__(
        &f.wallet,
        &signer_key(&f.env, 1),
        &soroban_sdk::vec![&f.env, ctx],
    );
    assert_eq!(f.policy.available_today(&f.wallet, &f.merchant), 25_000);
}

#[test]
#[should_panic] // MandateExpired
fn transfer_after_mandate_expiry_reverts() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy.set_allowance(
        &f.wallet,
        &f.merchant,
        &signer_bytes(&f.env, 1),
        &10_000,
        &30_000,
        &1_000,
    );
    f.env.ledger().with_mut(|l| l.timestamp += 1_001);

    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 1_000);
    f.policy.policy__(
        &f.wallet,
        &signer_key(&f.env, 1),
        &soroban_sdk::vec![&f.env, ctx],
    );
}

#[test]
#[should_panic] // NotInstalled
fn policy_refuses_wallets_that_never_installed_it() {
    let env = Env::default();
    env.mock_all_auths();
    let policy_id = env.register(Contract, ());
    let policy = ContractClient::new(&env, &policy_id);

    let wallet = Address::generate(&env);
    let merchant = Address::generate(&env);
    let token = Address::generate(&env);

    // Deliberately never called `install(wallet)`.
    let ctx = transfer_context(&env, &token, &wallet, &merchant, 1);
    policy.policy__(&wallet, &signer_key(&env, 1), &soroban_sdk::vec![&env, ctx]);
}

#[test]
#[should_panic] // NotAllowed — wrong function
fn policy_denies_non_transfer_invocations() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy.set_allowance(
        &f.wallet,
        &f.merchant,
        &signer_bytes(&f.env, 1),
        &10_000,
        &30_000,
        &MANDATE_SECS,
    );

    let ctx = Context::Contract(ContractContext {
        contract: token,
        fn_name: symbol_short!("mint"),
        args: (f.wallet.clone(), 10_000i128).into_val(&f.env),
    });
    f.policy.policy__(
        &f.wallet,
        &signer_key(&f.env, 1),
        &soroban_sdk::vec![&f.env, ctx],
    );
}

#[test]
#[should_panic] // NotAllowed — targets the wallet's own admin surface
fn policy_denies_context_targeting_the_wallet_itself() {
    let f = setup();
    f.policy.set_allowance(
        &f.wallet,
        &f.merchant,
        &signer_bytes(&f.env, 1),
        &10_000,
        &30_000,
        &MANDATE_SECS,
    );

    let ctx = Context::Contract(ContractContext {
        contract: f.wallet.clone(),
        fn_name: symbol_short!("transfer"),
        args: (f.wallet.clone(), f.merchant.clone(), 1i128).into_val(&f.env),
    });
    f.policy.policy__(
        &f.wallet,
        &signer_key(&f.env, 1),
        &soroban_sdk::vec![&f.env, ctx],
    );
}

/* ───────────── install / uninstall ───────────── */

/// Minimal stub implementing just enough of `SmartWalletInterface` for
/// `uninstall`'s permissionless self-clean check to exercise both branches,
/// without vendoring/registering a full smart-wallet contract.
#[contract]
struct StubWallet;

#[contractimpl]
impl StubWallet {
    /// Test-only: `Some` when `is_still_signer` was set true, `None` otherwise.
    pub fn set_still_signer(env: Env, still: bool) {
        env.storage()
            .instance()
            .set(&symbol_short!("still"), &still);
    }

    pub fn get_signer(env: Env, _signer_key: SignerKey) -> Option<SignerVal> {
        let still: bool = env
            .storage()
            .instance()
            .get(&symbol_short!("still"))
            .unwrap_or(false);
        if still {
            Some(SignerVal::Policy(
                SignerExpiration(None),
                SignerLimits(None),
            ))
        } else {
            None
        }
    }
}

#[test]
#[should_panic] // StillInstalled
fn uninstall_refuses_while_still_a_signer() {
    let env = Env::default();
    env.mock_all_auths();
    let policy_id = env.register(Contract, ());
    let policy = ContractClient::new(&env, &policy_id);

    let stub_id = env.register(StubWallet, ());
    let stub_client = StubWalletClient::new(&env, &stub_id);
    stub_client.set_still_signer(&true);

    policy.install(&stub_id);
    policy.uninstall(&stub_id);
}

#[test]
fn uninstall_succeeds_once_no_longer_a_signer() {
    let env = Env::default();
    env.mock_all_auths();
    let policy_id = env.register(Contract, ());
    let policy = ContractClient::new(&env, &policy_id);

    let stub_id = env.register(StubWallet, ());
    let stub_client = StubWalletClient::new(&env, &stub_id);
    stub_client.set_still_signer(&false);

    let wallet: Address = stub_id;
    policy.install(&wallet);
    policy.uninstall(&wallet); // must not panic
}

/// Pays `amount` to `f.merchant` with sub-key 1 at the current ledger time.
fn spend(f: &Fixture, token: &Address, amount: i128) {
    let ctx = transfer_context(&f.env, token, &f.wallet, &f.merchant, amount);
    f.policy.policy__(
        &f.wallet,
        &signer_key(&f.env, 1),
        &soroban_sdk::vec![&f.env, ctx],
    );
}

fn set_time(f: &Fixture, ts: u64) {
    f.env.ledger().with_mut(|l| l.timestamp = ts);
}

#[test]
fn spend_log_stays_bounded_under_many_micropayments() {
    // 1,800 invocations would write a multi-megabyte snapshot file.
    let f = setup_in(Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
    }));
    let token = Address::generate(&f.env);
    f.policy.set_allowance(
        &f.wallet,
        &f.merchant,
        &signer_bytes(&f.env, 1),
        &10,
        &1_000_000,
        &MANDATE_SECS,
    );

    // One payment a minute for 30 hours: 1,800 spends, more than a full day.
    let start = 900 * 1_000;
    for i in 0..1_800u64 {
        set_time(&f, start + i * 60);
        spend(&f, &token, 1);
    }

    let log_len = f
        .policy
        .get_allowance(&f.wallet, &f.merchant)
        .spend_log
        .len();
    assert!(
        log_len as u64 <= DAY_SECONDS / SPEND_BUCKET_SECONDS + 1,
        "spend_log grew to {log_len} entries"
    );
}

#[test]
#[should_panic] // ExceedsDailyCap
fn merged_spends_still_count_against_daily_cap() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy.set_allowance(
        &f.wallet,
        &f.merchant,
        &signer_bytes(&f.env, 1),
        &10_000,
        &25_000,
        &MANDATE_SECS,
    );

    let start = 900 * 1_000;
    set_time(&f, start);
    spend(&f, &token, 10_000);
    set_time(&f, start + 60); // same bucket: merged into one entry
    spend(&f, &token, 10_000);
    assert_eq!(f.policy.available_today(&f.wallet, &f.merchant), 5_000);

    set_time(&f, start + 120);
    spend(&f, &token, 10_000); // 30,000 > 25,000
}

#[test]
fn merged_entry_expires_conservatively_never_early() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy.set_allowance(
        &f.wallet,
        &f.merchant,
        &signer_bytes(&f.env, 1),
        &10_000,
        &20_000,
        &MANDATE_SECS,
    );

    let start = 900 * 1_000;
    set_time(&f, start);
    spend(&f, &token, 10_000);
    set_time(&f, start + 800); // same bucket, merged under the later time
    spend(&f, &token, 10_000);

    // The first spend is truly 24h old here, but the merged entry carries the
    // later timestamp, so the whole amount still counts: refused early, never
    // over-allowed.
    set_time(&f, start + DAY_SECONDS + 1);
    assert_eq!(f.policy.available_today(&f.wallet, &f.merchant), 0);

    // Once the later spend has also left the window, the full cap is back.
    set_time(&f, start + 800 + DAY_SECONDS);
    assert_eq!(f.policy.available_today(&f.wallet, &f.merchant), 20_000);
}

/// The contract panics with `PolicyError` rather than returning it, so the
/// generated `try_` client reports it as a plain contract error code.
fn policy_error(e: PolicyError) -> soroban_sdk::Error {
    soroban_sdk::Error::from_contract_error(e as u32)
}

fn grant(f: &Fixture, mandate_seconds: u64) {
    f.policy.set_allowance(
        &f.wallet,
        &f.merchant,
        &signer_bytes(&f.env, 1),
        &10_000,
        &30_000,
        &mandate_seconds,
    );
}

#[test]
fn revoke_is_final_until_a_fresh_grant() {
    let f = setup();
    grant(&f, MANDATE_SECS);
    f.policy.revoke(&f.wallet, &f.merchant);

    assert_eq!(
        f.policy.try_resume(&f.wallet, &f.merchant),
        Err(Ok(policy_error(PolicyError::Revoked)))
    );
    assert_eq!(
        f.policy.try_pause(&f.wallet, &f.merchant),
        Err(Ok(policy_error(PolicyError::Revoked)))
    );

    // A new set_allowance is an explicit owner decision and re-opens it.
    grant(&f, MANDATE_SECS);
    assert_eq!(
        f.policy.get_allowance(&f.wallet, &f.merchant).status,
        Status::Active
    );
}

#[test]
fn mandate_must_be_positive_and_at_most_a_year() {
    let f = setup();
    for bad in [0, MAX_MANDATE_SECONDS + 1] {
        assert_eq!(
            f.policy.try_set_allowance(
                &f.wallet,
                &f.merchant,
                &signer_bytes(&f.env, 1),
                &10_000,
                &30_000,
                &bad,
            ),
            Err(Ok(policy_error(PolicyError::InvalidMandate)))
        );
    }
    grant(&f, MAX_MANDATE_SECONDS);
}

#[test]
fn spend_and_status_changes_emit_events() {
    let f = setup();
    let token = Address::generate(&f.env);
    grant(&f, MANDATE_SECS);

    spend(&f, &token, 1_000);
    assert_eq!(
        f.env.events().all(),
        soroban_sdk::vec![
            &f.env,
            (
                f.policy.address.clone(),
                (
                    Symbol::new(&f.env, "spent"),
                    f.wallet.clone(),
                    f.merchant.clone()
                )
                    .into_val(&f.env),
                soroban_sdk::map![&f.env, (Symbol::new(&f.env, "amount"), 1_000_i128)]
                    .into_val(&f.env),
            ),
        ]
    );

    f.policy.pause(&f.wallet, &f.merchant);
    assert_eq!(
        f.env.events().all(),
        soroban_sdk::vec![
            &f.env,
            (
                f.policy.address.clone(),
                (
                    Symbol::new(&f.env, "status_changed"),
                    f.wallet.clone(),
                    f.merchant.clone()
                )
                    .into_val(&f.env),
                soroban_sdk::map![&f.env, (Symbol::new(&f.env, "status"), Status::Paused)]
                    .into_val(&f.env),
            ),
        ]
    );
}
