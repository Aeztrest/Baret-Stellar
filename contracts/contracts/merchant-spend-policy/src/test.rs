#![cfg(test)]

use super::*;
use smart_wallet_interface::types::{SignerExpiration, SignerLimits, SignerVal};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    Address, Env, IntoVal,
};

const MANDATE_SECS: u64 = 30 * DAY_SECONDS;

struct Fixture<'a> {
    env: Env,
    policy: ContractClient<'a>,
    wallet: Address,
    merchant: Address,
}

fn setup<'a>() -> Fixture<'a> {
    let env = Env::default();
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

/// `policy__`'s `signer` argument is opaque to this contract (only
/// `source`/`contexts` are inspected) — any well-formed key works in tests.
fn dummy_signer_key(env: &Env) -> SignerKey {
    SignerKey::Ed25519(soroban_sdk::BytesN::from_array(env, &[0u8; 32]))
}

#[test]
fn transfer_within_caps_settles_and_records_spend() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy
        .set_allowance(&f.wallet, &f.merchant, &10_000, &30_000, &MANDATE_SECS);

    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 10_000);
    f.policy.policy__(
        &f.wallet,
        &dummy_signer_key(&f.env),
        &soroban_sdk::vec![&f.env, ctx],
    );

    assert_eq!(f.policy.available_today(&f.wallet, &f.merchant), 20_000);
}

#[test]
#[should_panic] // ExceedsPerTx
fn transfer_above_per_tx_cap_reverts() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy
        .set_allowance(&f.wallet, &f.merchant, &10_000, &30_000, &MANDATE_SECS);

    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 10_001);
    f.policy.policy__(
        &f.wallet,
        &dummy_signer_key(&f.env),
        &soroban_sdk::vec![&f.env, ctx],
    );
}

#[test]
#[should_panic] // ExceedsDailyCap
fn cumulative_spend_past_daily_cap_reverts() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy
        .set_allowance(&f.wallet, &f.merchant, &10_000, &25_000, &MANDATE_SECS);

    for _ in 0..2 {
        let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 10_000);
        f.policy.policy__(
            &f.wallet,
            &dummy_signer_key(&f.env),
            &soroban_sdk::vec![&f.env, ctx],
        );
    }
    // 20_000 spent so far — this third payment would push it to 30_000 > 25_000.
    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 10_000);
    f.policy.policy__(
        &f.wallet,
        &dummy_signer_key(&f.env),
        &soroban_sdk::vec![&f.env, ctx],
    );
}

#[test]
fn rolling_window_resets_after_24h() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy
        .set_allowance(&f.wallet, &f.merchant, &10_000, &10_000, &MANDATE_SECS);

    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 10_000);
    f.policy.policy__(
        &f.wallet,
        &dummy_signer_key(&f.env),
        &soroban_sdk::vec![&f.env, ctx.clone()],
    );
    assert_eq!(f.policy.available_today(&f.wallet, &f.merchant), 0);

    f.env.ledger().with_mut(|l| l.timestamp += DAY_SECONDS + 1);

    // A day later the sliding window has fully rolled off — full cap again.
    f.policy.policy__(
        &f.wallet,
        &dummy_signer_key(&f.env),
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
        &dummy_signer_key(&f.env),
        &soroban_sdk::vec![&f.env, ctx],
    );
}

#[test]
#[should_panic] // NotActive
fn transfer_to_revoked_merchant_reverts() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy
        .set_allowance(&f.wallet, &f.merchant, &10_000, &30_000, &MANDATE_SECS);
    f.policy.revoke(&f.wallet, &f.merchant);

    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 1_000);
    f.policy.policy__(
        &f.wallet,
        &dummy_signer_key(&f.env),
        &soroban_sdk::vec![&f.env, ctx],
    );
}

#[test]
fn pause_then_resume_restores_spend() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy
        .set_allowance(&f.wallet, &f.merchant, &10_000, &30_000, &MANDATE_SECS);
    f.policy.pause(&f.wallet, &f.merchant);
    f.policy.resume(&f.wallet, &f.merchant);

    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 5_000);
    f.policy.policy__(
        &f.wallet,
        &dummy_signer_key(&f.env),
        &soroban_sdk::vec![&f.env, ctx],
    );
    assert_eq!(f.policy.available_today(&f.wallet, &f.merchant), 25_000);
}

#[test]
#[should_panic] // MandateExpired
fn transfer_after_mandate_expiry_reverts() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy
        .set_allowance(&f.wallet, &f.merchant, &10_000, &30_000, &1_000);
    f.env.ledger().with_mut(|l| l.timestamp += 1_001);

    let ctx = transfer_context(&f.env, &token, &f.wallet, &f.merchant, 1_000);
    f.policy.policy__(
        &f.wallet,
        &dummy_signer_key(&f.env),
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
    policy.policy__(&wallet, &dummy_signer_key(&env), &soroban_sdk::vec![&env, ctx]);
}

#[test]
#[should_panic] // NotAllowed — wrong function
fn policy_denies_non_transfer_invocations() {
    let f = setup();
    let token = Address::generate(&f.env);
    f.policy
        .set_allowance(&f.wallet, &f.merchant, &10_000, &30_000, &MANDATE_SECS);

    let ctx = Context::Contract(ContractContext {
        contract: token,
        fn_name: symbol_short!("mint"),
        args: (f.wallet.clone(), 10_000i128).into_val(&f.env),
    });
    f.policy.policy__(
        &f.wallet,
        &dummy_signer_key(&f.env),
        &soroban_sdk::vec![&f.env, ctx],
    );
}

#[test]
#[should_panic] // NotAllowed — targets the wallet's own admin surface
fn policy_denies_context_targeting_the_wallet_itself() {
    let f = setup();
    f.policy
        .set_allowance(&f.wallet, &f.merchant, &10_000, &30_000, &MANDATE_SECS);

    let ctx = Context::Contract(ContractContext {
        contract: f.wallet.clone(),
        fn_name: symbol_short!("transfer"),
        args: (f.wallet.clone(), f.merchant.clone(), 1i128).into_val(&f.env),
    });
    f.policy.policy__(
        &f.wallet,
        &dummy_signer_key(&f.env),
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
        env.storage().instance().set(&symbol_short!("still"), &still);
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

    policy.install(&stub_id.clone().try_into().unwrap());
    policy.uninstall(&stub_id.try_into().unwrap());
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

    let wallet: Address = stub_id.try_into().unwrap();
    policy.install(&wallet);
    policy.uninstall(&wallet); // must not panic
}
