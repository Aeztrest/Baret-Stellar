#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

/// Spin up a Stellar Asset Contract we can mint test balances in, returning
/// both the user-facing token client and the admin (mint) client.
fn make_token<'a>(env: &Env, admin: &Address) -> (token::Client<'a>, token::StellarAssetClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let addr = sac.address();
    (
        token::Client::new(env, &addr),
        token::StellarAssetClient::new(env, &addr),
    )
}

struct Fixture<'a> {
    env: Env,
    guard: PaymentGuardClient<'a>,
    token: token::Client<'a>,
    owner: Address,
}

fn setup<'a>() -> Fixture<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let owner = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let (token, token_admin_client) = make_token(&env, &token_admin);

    let guard_id = env.register(PaymentGuard, ());
    let guard = PaymentGuardClient::new(&env, &guard_id);
    guard.init(&owner, &token.address);

    // Fund the owner, then deposit into the vault so it can settle payments.
    token_admin_client.mint(&owner, &1_000_000);
    guard.deposit(&owner, &500_000);

    Fixture { env, guard, token, owner }
}

#[test]
fn pay_within_caps_settles_and_records_spend() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &30_000);

    f.guard.pay(&merchant, &10_000);

    assert_eq!(f.token.balance(&merchant), 10_000);
    assert_eq!(f.guard.available_today(&merchant), 20_000);
    let a = f.guard.get_allowance(&merchant);
    assert_eq!(a.spent_day, 10_000);
}

#[test]
#[should_panic] // ExceedsPerTx
fn pay_above_per_tx_cap_reverts() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &30_000);
    f.guard.pay(&merchant, &10_001);
}

#[test]
#[should_panic] // ExceedsDailyCap
fn cumulative_spend_past_daily_cap_reverts() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &25_000);
    f.guard.pay(&merchant, &10_000);
    f.guard.pay(&merchant, &10_000); // 20_000 total — ok
    f.guard.pay(&merchant, &10_000); // 30_000 > 25_000 — reverts
}

#[test]
#[should_panic] // NoAllowance
fn pay_to_unregistered_merchant_reverts() {
    let f = setup();
    let stranger = Address::generate(&f.env);
    f.guard.pay(&stranger, &1);
}

#[test]
#[should_panic] // NotActive
fn pay_to_revoked_merchant_reverts() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &30_000);
    f.guard.revoke(&merchant);
    f.guard.pay(&merchant, &1_000);
}

#[test]
fn rolling_window_resets_after_24h() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &10_000);
    f.guard.pay(&merchant, &10_000); // daily cap fully spent
    assert_eq!(f.guard.available_today(&merchant), 0);

    // Advance the ledger clock past the rolling window.
    f.env.ledger().with_mut(|l| l.timestamp += DAY_SECONDS + 1);

    assert_eq!(f.guard.available_today(&merchant), 10_000);
    f.guard.pay(&merchant, &10_000); // allowed again in the new window
    assert_eq!(f.token.balance(&merchant), 20_000);
}

#[test]
fn owner_can_withdraw() {
    let f = setup();
    let before = f.token.balance(&f.owner);
    f.guard.withdraw(&100_000);
    assert_eq!(f.token.balance(&f.owner), before + 100_000);
}
