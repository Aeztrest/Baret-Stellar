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

/// Default mandate lifetime used across tests that aren't specifically about
/// expiry — mirrors the extension's BALANCED_POLICY `mandateMaxAgeDays: 30`.
const MANDATE_SECS: u64 = 30 * DAY_SECONDS;

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
    f.guard.set_allowance(&merchant, &10_000, &30_000, &MANDATE_SECS);

    f.guard.pay(&merchant, &10_000);

    assert_eq!(f.token.balance(&merchant), 10_000);
    assert_eq!(f.guard.available_today(&merchant), 20_000);
}

#[test]
#[should_panic] // ExceedsPerTx
fn pay_above_per_tx_cap_reverts() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &30_000, &MANDATE_SECS);
    f.guard.pay(&merchant, &10_001);
}

#[test]
#[should_panic] // ExceedsDailyCap
fn cumulative_spend_past_daily_cap_reverts() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &25_000, &MANDATE_SECS);
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
    f.guard.set_allowance(&merchant, &10_000, &30_000, &MANDATE_SECS);
    f.guard.revoke(&merchant);
    f.guard.pay(&merchant, &1_000);
}

#[test]
fn rolling_window_resets_after_24h() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &10_000, &MANDATE_SECS);
    f.guard.pay(&merchant, &10_000); // daily cap fully spent
    assert_eq!(f.guard.available_today(&merchant), 0);

    // Advance the ledger clock past the window.
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

/* ───────────── reserve accounting ───────────── */

#[test]
#[should_panic] // InsufficientReserve
fn withdraw_cannot_drain_below_active_merchant_reserve() {
    let f = setup(); // vault holds 500_000
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &450_000, &MANDATE_SECS);
    // Vault must keep at least 450_000 reserved for this active merchant;
    // withdrawing everything would leave 0 < 450_000.
    f.guard.withdraw(&500_000);
}

#[test]
fn withdraw_up_to_the_reserve_line_succeeds() {
    let f = setup(); // vault holds 500_000
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &450_000, &MANDATE_SECS);
    // Leaves exactly 450_000 behind — at the reserve line, not below it.
    f.guard.withdraw(&50_000);
    assert_eq!(f.token.balance(&f.guard.address), 450_000);
}

#[test]
fn revoking_a_merchant_frees_its_reserve_for_withdrawal() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &450_000, &MANDATE_SECS);
    f.guard.revoke(&merchant);
    // No longer active, so its cap no longer reserves vault funds.
    f.guard.withdraw(&500_000);
    assert_eq!(f.token.balance(&f.guard.address), 0);
}

/* ───────────── sliding-window boundary regression ─────────────
 * Regression test for the fixed-window bug: spending the full cap right
 * before the old bucket boundary, then again a few seconds after, used to
 * grant ~2x the daily cap. With a true sliding window this must revert.
 */
#[test]
#[should_panic] // ExceedsDailyCap
fn cannot_double_spend_daily_cap_across_old_bucket_boundary() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &10_000, &MANDATE_SECS); // window conceptually starts at t=0

    // Advance to 1s before where the old fixed-window reset would have
    // fired (day_start + DAY_SECONDS) and spend the full cap.
    f.env.ledger().with_mut(|l| l.timestamp += DAY_SECONDS - 1); // t = 86399
    f.guard.pay(&merchant, &10_000);

    // Advance only 2 more real seconds, crossing the old reset boundary.
    // The old fixed-window code would treat this as a brand-new window and
    // allow the cap to be spent again — 2x the daily cap in ~2 seconds. A
    // true sliding window still sees the first payment (only 2s old) inside
    // the trailing 24h and must revert.
    f.env.ledger().with_mut(|l| l.timestamp += 2); // t = 86401
    f.guard.pay(&merchant, &10_000);
}

#[test]
fn sliding_window_allows_spend_once_first_payment_fully_ages_out() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &10_000, &MANDATE_SECS);
    f.env.ledger().with_mut(|l| l.timestamp += DAY_SECONDS - 1); // t = 86399
    f.guard.pay(&merchant, &10_000);

    // Only once the first payment is genuinely >24h old does capacity
    // return — i.e. more than DAY_SECONDS after t=86399, not just after
    // crossing the old fixed bucket's reset point.
    f.env.ledger().with_mut(|l| l.timestamp += DAY_SECONDS + 1); // t = 172799
    assert_eq!(f.guard.available_today(&merchant), 10_000);
    f.guard.pay(&merchant, &10_000);
    assert_eq!(f.token.balance(&merchant), 20_000);
}

/* ───────────── pause / resume ───────────── */

#[test]
#[should_panic] // NotActive
fn pay_to_paused_merchant_reverts() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &30_000, &MANDATE_SECS);
    f.guard.pause(&merchant);
    f.guard.pay(&merchant, &1_000);
}

#[test]
fn resume_restores_active_status_and_preserves_window() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &30_000, &MANDATE_SECS);
    f.guard.pay(&merchant, &10_000);

    f.guard.pause(&merchant);
    f.guard.resume(&merchant);

    // Still active, and the earlier spend is still counted in the window
    // (resume must not reset spend history back to full cap).
    assert_eq!(f.guard.available_today(&merchant), 20_000);
    f.guard.pay(&merchant, &5_000);
    assert_eq!(f.token.balance(&merchant), 15_000);
}

/* ───────────── negative / invalid amounts ───────────── */

#[test]
#[should_panic] // InvalidAmount
fn deposit_zero_or_negative_reverts() {
    let f = setup();
    f.guard.deposit(&f.owner, &0);
}

#[test]
#[should_panic] // InvalidAmount
fn pay_zero_or_negative_reverts() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &30_000, &MANDATE_SECS);
    f.guard.pay(&merchant, &0);
}

#[test]
#[should_panic] // InvalidAmount
fn withdraw_zero_or_negative_reverts() {
    let f = setup();
    f.guard.withdraw(&0);
}

#[test]
#[should_panic] // InvalidAmount
fn set_allowance_negative_cap_reverts() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &-1, &10_000, &MANDATE_SECS);
}

/* ───────────── mandate expiry ─────────────
 * `set_allowance` grants a bounded mandate, not a perpetual one — the caps
 * alone were never meant to stand in for the owner's original authorization.
 * `pay` must refuse once `expires_at` has passed, and a fresh `set_allowance`
 * call (an explicit renewal) must restore it.
 */

#[test]
fn pay_just_before_mandate_expiry_succeeds() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    let mandate_secs: u64 = 1_000;
    f.guard.set_allowance(&merchant, &10_000, &30_000, &mandate_secs);

    f.env.ledger().with_mut(|l| l.timestamp += mandate_secs); // exactly at expiry, not past it
    f.guard.pay(&merchant, &1_000);
    assert_eq!(f.token.balance(&merchant), 1_000);
}

#[test]
#[should_panic] // MandateExpired
fn pay_after_mandate_expiry_reverts() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    let mandate_secs: u64 = 1_000;
    f.guard.set_allowance(&merchant, &10_000, &30_000, &mandate_secs);

    f.env.ledger().with_mut(|l| l.timestamp += mandate_secs + 1); // 1s past expiry
    f.guard.pay(&merchant, &1_000);
}

#[test]
fn renewing_set_allowance_after_expiry_restores_pay() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    let mandate_secs: u64 = 1_000;
    f.guard.set_allowance(&merchant, &10_000, &30_000, &mandate_secs);
    f.env.ledger().with_mut(|l| l.timestamp += mandate_secs + 1);

    // A fresh, explicit grant renews the mandate from the current ledger time.
    f.guard.set_allowance(&merchant, &10_000, &30_000, &mandate_secs);
    f.guard.pay(&merchant, &1_000);
    assert_eq!(f.token.balance(&merchant), 1_000);
}

/* ───────────── auth boundaries ─────────────
 * `mock_all_auths()` (used by `setup()`) approves *any* address's
 * `require_auth()` unconditionally — it proves the code path runs, not that
 * it's gated to the right signer. To actually verify the owner-only surface
 * we check two things instead:
 *   1. With **no** auth mocking at all, the one-time `init` call — which is
 *      the exact function the critical finding was about — must panic
 *      rather than silently succeed for an unauthenticated caller.
 *   2. Under the mocked fixture, `env.auths()` after each owner-gated call
 *      must show that *the owner's* address, specifically, was required to
 *      authorize it (not e.g. the merchant, or nobody).
 */

#[test]
#[should_panic]
fn init_without_owner_auth_panics() {
    let env = Env::default(); // deliberately no mock_all_auths()
    let owner = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let (token, _admin) = make_token(&env, &token_admin);
    let guard_id = env.register(PaymentGuard, ());
    let guard = PaymentGuardClient::new(&env, &guard_id);
    guard.init(&owner, &token.address);
}

#[test]
fn set_allowance_requires_owner_authorization() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &30_000, &MANDATE_SECS);
    let auths = f.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, f.owner);
}

#[test]
fn pause_resume_revoke_require_owner_authorization() {
    let f = setup();
    let merchant = Address::generate(&f.env);
    f.guard.set_allowance(&merchant, &10_000, &30_000, &MANDATE_SECS);

    f.guard.pause(&merchant);
    assert_eq!(f.env.auths()[0].0, f.owner);

    f.guard.resume(&merchant);
    assert_eq!(f.env.auths()[0].0, f.owner);

    f.guard.revoke(&merchant);
    assert_eq!(f.env.auths()[0].0, f.owner);
}

#[test]
fn withdraw_requires_owner_authorization() {
    let f = setup();
    f.guard.withdraw(&1_000);
    let auths = f.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, f.owner);
}

#[test]
fn init_requires_owner_authorization() {
    let env = Env::default();
    env.mock_all_auths();
    let owner = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let (token, _admin) = make_token(&env, &token_admin);
    let guard_id = env.register(PaymentGuard, ());
    let guard = PaymentGuardClient::new(&env, &guard_id);
    guard.init(&owner, &token.address);
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, owner);
}
