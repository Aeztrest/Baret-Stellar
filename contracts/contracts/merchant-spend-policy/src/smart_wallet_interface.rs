//! Vendored subset of `smart-wallet-interface`, the companion crate to the
//! passkey-kit smart-wallet contract this policy plugs into as a
//! `Signer::Policy`.
//!
//! Source: <https://github.com/stellar/passkey-kit>, commit
//! `309537474f689a7948c729a7bab0d1388f509422` (2026-07-31, v1 line —
//! `passkey-kit-sdk` bindings era 0.14.0), path `contracts/smart-wallet-interface`.
//! License: Apache-2.0, Copyright Stellar Development Foundation.
//!
//! Vendored (copied, not modified) rather than pulled in as a git
//! dependency so the exact interface this contract binds to is reviewable
//! in this repo and pinned the same way `contracts/DEPLOYMENT.md` pins
//! WASM hashes — no "locally rebuilt" or drifting reference. Only the
//! pieces this policy actually needs are included: the `PolicyInterface`
//! trait (+ generated `PolicyClient`), `SmartWalletInterface` (+ generated
//! `SmartWalletClient`, needed by `uninstall`'s self-clean check), and the
//! `types` module. The `events` module (typed events for the wallet's own
//! signer-management operations) is intentionally omitted — a policy never
//! emits those.
//!
//! Doc comments below are preserved verbatim from the source for the
//! contract-level invariants they document (`SignerLimits`, `PolicyInterface`
//! in particular) — this policy's own `policy__` implementation relies on
//! those invariants holding.

#![allow(dead_code)]

pub mod types {
    use soroban_sdk::{contracterror, contracttype, Address, Bytes, BytesN, Map, Vec};

    /// Contract errors.
    ///
    /// Deliberately renumbered for the v1 interface so the error space is disjoint
    /// from the legacy (pre-1.0) contract's 1-9 range. A client decoding an error
    /// code < 100 is talking to a legacy wallet.
    ///
    /// Ranges:
    /// - 100-109: signer storage / management
    /// - 110-119: auth (`__check_auth`)
    /// - 120-129: WebAuthn (secp256r1) verification
    #[contracterror]
    #[derive(Copy, Clone, Debug, Eq, PartialEq)]
    #[repr(u32)]
    pub enum Error {
        SignerNotFound = 100,
        SignerAlreadyExists = 101,
        SignerExpired = 102,
        LastAdminSigner = 103,
        LastSigner = 104,
        MissingContext = 110,
        SignatureKeyValueMismatch = 111,
        ClientDataJsonTooLarge = 120,
        ClientDataJsonParseError = 121,
        ClientDataJsonChallengeIncorrect = 122,
        InvalidWebAuthnType = 123,
        InvalidAuthenticatorData = 124,
        UserPresenceRequired = 125,
        AuthenticatorDataTooLarge = 126,
    }

    /// Optional expiration for a signer as a UNIX timestamp in seconds, INCLUSIVE:
    /// the signer is valid while `ledger timestamp <= expiration` and expired once
    /// `ledger timestamp > expiration`. `None` never expires.
    #[contracttype]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct SignerExpiration(pub Option<u64>);

    /// Restrictions on which auth contexts a signer may authorize.
    ///
    /// - `None`: unlimited.
    /// - `Some(empty map)`: NO permissions (fail-closed).
    /// - `Some({address -> None})`: the signer may authorize any invocation of
    ///   contract `address`, with no co-signers required.
    /// - `Some({address -> Some([keys])})`: the signer may authorize invocations
    ///   of contract `address` only if every listed key also APPROVES. The listed
    ///   keys are required CO-SIGNERS.
    #[contracttype]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct SignerLimits(pub Option<Map<Address, Option<Vec<SignerKey>>>>);

    /// Which durability a signer entry is stored under.
    #[contracttype]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub enum SignerStorage {
        Persistent,
        Temporary,
    }

    /// Full signer description used by `__constructor`, `add_signer` and
    /// `update_signer`.
    #[contracttype]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub enum Signer {
        Policy(Address, SignerExpiration, SignerLimits, SignerStorage),
        Ed25519(BytesN<32>, SignerExpiration, SignerLimits, SignerStorage),
        Secp256r1(
            Bytes,
            BytesN<65>,
            SignerExpiration,
            SignerLimits,
            SignerStorage,
        ),
    }

    /// Storage key identifying a signer. Secp256r1 carries the WebAuthn
    /// credential id (`keyId`).
    #[contracttype]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub enum SignerKey {
        Policy(Address),
        Ed25519(BytesN<32>),
        Secp256r1(Bytes),
    }

    /// Stored signer value. Secp256r1 carries the SEC-1 uncompressed public key.
    #[contracttype]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub enum SignerVal {
        Policy(SignerExpiration, SignerLimits),
        Ed25519(SignerExpiration, SignerLimits),
        Secp256r1(BytesN<65>, SignerExpiration, SignerLimits),
    }
}

use soroban_sdk::{auth::Context, contractclient, Address, BytesN, Env, Vec};
use types::{Error, Signer, SignerKey, SignerVal};

#[contractclient(name = "SmartWalletClient")]
pub trait SmartWalletInterface {
    fn __constructor(env: Env, signer: Signer);
    fn add_signer(env: Env, signer: Signer) -> Result<(), Error>;
    fn update_signer(env: Env, signer: Signer) -> Result<(), Error>;
    fn remove_signer(env: Env, signer_key: SignerKey) -> Result<(), Error>;
    fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error>;
    /// Return the stored signer value for a key, or `None` if not stored.
    fn get_signer(env: Env, signer_key: SignerKey) -> Option<SignerVal>;
}

/// Authorization check invoked by a smart wallet during `__check_auth`.
///
/// ## Caller authentication
///
/// `policy__` is PUBLICLY CALLABLE — anyone can invoke it with an arbitrary
/// `source` and `contexts`. Every implementation MUST be side-effect-free, or
/// call `source.require_auth()` before any security-relevant state change —
/// during a legitimate check the wallet is the DIRECT invoker of `policy__`,
/// so invoker auth satisfies it; a spoofed external caller cannot satisfy it
/// for a wallet it does not control.
///
/// ## Value transfers with a SECRETLESS policy
///
/// `Signature::Policy` carries NO secret. A per-transfer cap alone is NOT a
/// spending limit: repeated capped transfers can move the wallet's full
/// balance. A value-moving policy is only safe when it is a CUMULATIVE /
/// rate-limited allowance bounding total spend over a window, and/or paired
/// (via the granting signer's `SignerLimits`) with an authenticated
/// cryptographic co-signer.
#[contractclient(name = "PolicyClient")]
pub trait PolicyInterface {
    fn policy__(env: Env, source: Address, signer: SignerKey, contexts: Vec<Context>);
    /// Lifecycle hook invoked by a wallet when this policy is added as a
    /// signer. The wallet is the direct invoker, so `wallet.require_auth()`
    /// here is satisfied by invoker auth. A HARD call — a panic aborts the
    /// `add_signer`.
    fn install(env: Env, wallet: Address);
    /// PERMISSIONLESS self-clean entrypoint. The wallet does NOT call this
    /// on removal; anyone may call it. MUST verify the policy is genuinely
    /// no longer a signer on `wallet` before clearing state.
    fn uninstall(env: Env, wallet: Address);
}
