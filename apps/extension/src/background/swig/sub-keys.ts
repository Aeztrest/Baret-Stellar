/**
 * Smart-wallet sub-key add / remove builders (Stellar build).
 *
 * A sub-key is registered as an `Ed25519` signer on the passkey-kit smart
 * wallet, `SignerLimits`-scoped to ONE token contract and requiring
 * `MerchantSpendPolicy`'s (`contracts/contracts/merchant-spend-policy`)
 * approval on every use (see `smart-wallet-config.ts` and
 * `docs/x402-defense.md` §11). This is real, on-chain enforcement — not the
 * unlimited-allowance placeholder this file used to build: a leaked sub-key
 * secret cannot authorize anything the policy's per-merchant cap and the
 * wallet's own `SignerLimits` don't already allow (no other contract, no
 * wallet admin surface, no cap-exceeding transfer).
 *
 * Both builders submit directly (no popup sign-queue): registering or
 * removing a signer is a wallet-configuration action the extension performs
 * with the already-unlocked authority, the same way `provision.ts`'s
 * initial deploy does — not a per-payment action needing user review.
 */

import { Keypair, StrKey, xdr } from "@stellar/stellar-sdk";
import { basicNodeSigner, Client as SorobanClient } from "@stellar/stellar-sdk/contract";
import type { AssembledTransaction } from "@stellar/stellar-sdk/contract";
import {
  PasskeyClient,
  Ed25519Signer,
  SignerKey,
  SignerStore,
  type PasskeyKitConfig,
} from "passkey-kit";
import { PasskeyKit } from "passkey-kit";
import { activeAccountEntry, readKeystore } from "../db/keystore";
import { getNetworkPassphrase, getSorobanRpcUrl } from "../rpc/connection";
import { SMART_WALLET_WASM_HASH, MERCHANT_SPEND_POLICY_CONTRACT_ID } from "./smart-wallet-config";

/**
 * Dynamic client surface for `contracts/contracts/merchant-spend-policy`
 * (typed by hand against `lib.rs`'s `set_allowance` — there's no generated
 * TS binding since the contract isn't published anywhere `stellar contract
 * bindings` could read from; `Client.from` fetches the actual on-chain spec
 * at call time and validates argument shapes against it regardless of this
 * type, so a mismatch here fails loudly rather than silently).
 */
interface MerchantSpendPolicyClient {
  set_allowance(args: {
    wallet: string;
    merchant: string;
    signer: Buffer;
    cap_per_tx: bigint;
    cap_per_day: bigint;
    mandate_seconds: bigint;
  }): Promise<AssembledTransaction<null>>;
}

export interface SubKeyProvisionResult {
  /** Newly generated sub-key keypair. Caller persists this (encrypted). */
  subKey: Keypair;
  /** Smart-wallet contract address (`C…`). */
  smartWalletAddress: string;
  /** On-chain signature of the `add_signer` transaction. */
  signature: string;
}

/** The active account's deployed smart-wallet contract address (`C…`), read fresh from the keystore. */
export async function loadSmartWalletAddress(): Promise<string> {
  const row = await readKeystore();
  if (!row) throw new Error("No wallet keystore");
  const smartWalletAddress = activeAccountEntry(row).smartWalletAddress;
  if (!smartWalletAddress || !StrKey.isValidContract(smartWalletAddress)) {
    throw new Error("Smart-wallet contract address missing or invalid");
  }
  return smartWalletAddress;
}

/** Connects a `PasskeyKit` to an already-deployed wallet, bypassing the WebAuthn `connectWallet` ceremony — we know our own contract address from the keystore. */
export function connectKit(smartWalletAddress: string, authorityPublicKey: string): PasskeyKit {
  const config: PasskeyKitConfig = {
    rpcUrl: getSorobanRpcUrl(),
    networkPassphrase: getNetworkPassphrase(),
    walletWasmHash: SMART_WALLET_WASM_HASH,
  };
  const kit = new PasskeyKit(config);
  kit.wallet = new PasskeyClient({
    contractId: smartWalletAddress,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    publicKey: authorityPublicKey,
  });
  return kit;
}

/**
 * Registers `subKey` as an Ed25519 signer on the user's smart wallet,
 * scoped via `SignerLimits` to `tokenContractId` and gated by
 * `MerchantSpendPolicy` — see this file's header for what that actually
 * guarantees. `expiresAt` is a UNIX timestamp (seconds); the sub-key's
 * on-chain signer entry and its `MerchantSpendPolicy` mandate should be
 * granted the SAME expiry so a lapsed sub-key can't linger as a
 * technically-still-registered (if policy-capped) signer.
 */
export async function buildAddSubKeyTransaction(
  authority: Keypair,
  subKey: Keypair,
  tokenContractId: string,
  expiresAt: number,
): Promise<SubKeyProvisionResult> {
  if (!MERCHANT_SPEND_POLICY_CONTRACT_ID) {
    throw new Error(
      "MerchantSpendPolicy is not deployed yet — see docs/x402-defense.md §11 for the deploy steps, then set MERCHANT_SPEND_POLICY_CONTRACT_ID in smart-wallet-config.ts.",
    );
  }
  const smartWalletAddress = await loadSmartWalletAddress();
  const networkPassphrase = getNetworkPassphrase();
  const kit = connectKit(smartWalletAddress, authority.publicKey());

  const limits = new Map([
    [tokenContractId, [SignerKey.Policy(MERCHANT_SPEND_POLICY_CONTRACT_ID)]],
  ]);

  const tx = await kit.addEd25519(subKey.publicKey(), limits, SignerStore.Temporary, expiresAt);
  // The wallet's own require_auth for add_signer — satisfied by our
  // authority, an existing admin signer on this wallet.
  const walletAuthorized = await kit.sign(tx, new Ed25519Signer(authority));
  // Classic envelope signature for the transaction's source account
  // (also `authority`, set via `connectKit`'s `publicKey`).
  await walletAuthorized.sign({
    signTransaction: basicNodeSigner(authority, networkPassphrase).signTransaction,
  });

  const sent = await walletAuthorized.send();
  if (sent.getTransactionResponse?.status !== "SUCCESS") {
    throw new Error(
      `add_signer failed on-chain: ${JSON.stringify(sent.getTransactionResponse ?? sent)}`,
    );
  }

  return {
    subKey,
    smartWalletAddress,
    signature: sent.sendTransactionResponse?.hash ?? "",
  };
}

/**
 * Registers `MerchantSpendPolicy` itself as a `Policy` signer on the wallet,
 * if it isn't one already — idempotent (checks `kit.getSigner` first, sends
 * nothing if already installed). This is the ONLY thing that fires the
 * policy's `install(wallet)` hook (invoked by the wallet's own `add_signer`
 * for a `Signer::Policy` entry — see `smart-wallet`'s `add_signer_impl`),
 * which is in turn required before `policy__` will accept anything for this
 * wallet (`Error::NotInstalled` otherwise). Registered with an EMPTY limits
 * map — `Some({})`, not `undefined`/unlimited — so this policy has NO
 * independent authority to cover a context on its own; it can only ever act
 * as a REQUIRED CO-SIGNER named inside another signer's own `SignerLimits`
 * (a co-signer's own limits are never consulted for that role — see
 * `smart-wallet`'s `context.rs#verify_signer_limit_keys`). Without this, the
 * policy's own `SignerLimits` would default to unlimited and it could be
 * used as a secretless, standalone `Signature::Policy` authorizer, bypassing
 * the sub-key's Ed25519 signature entirely.
 */
async function ensurePolicyInstalled(authority: Keypair): Promise<void> {
  if (!MERCHANT_SPEND_POLICY_CONTRACT_ID) {
    throw new Error(
      "MerchantSpendPolicy is not deployed yet — see contracts/contracts/merchant-spend-policy/DEPLOYMENT.md, then set MERCHANT_SPEND_POLICY_CONTRACT_ID in smart-wallet-config.ts.",
    );
  }
  const smartWalletAddress = await loadSmartWalletAddress();
  const networkPassphrase = getNetworkPassphrase();
  const kit = connectKit(smartWalletAddress, authority.publicKey());

  const alreadyInstalled = await kit.getSigner(SignerKey.Policy(MERCHANT_SPEND_POLICY_CONTRACT_ID));
  if (alreadyInstalled) return;

  const tx = await kit.addPolicy(MERCHANT_SPEND_POLICY_CONTRACT_ID, new Map(), SignerStore.Persistent);
  const walletAuthorized = await kit.sign(tx, new Ed25519Signer(authority));
  await walletAuthorized.sign({
    signTransaction: basicNodeSigner(authority, networkPassphrase).signTransaction,
  });
  const sent = await walletAuthorized.send();
  if (sent.getTransactionResponse?.status !== "SUCCESS") {
    throw new Error(
      `MerchantSpendPolicy install (add_signer) failed on-chain: ${JSON.stringify(sent.getTransactionResponse ?? sent)}`,
    );
  }
}

/**
 * Grants/renews `merchant`'s on-chain caps on `MerchantSpendPolicy`, bound
 * to a freshly minted sub-key, THEN registers that sub-key as an Ed25519
 * signer scoped (via `SignerLimits`) to `tokenContractId` and gated by that
 * policy — the on-chain calls that together make a leaked sub-key's blast
 * radius really just this merchant's cap, not the wallet AND not any other
 * merchant the wallet also approved (`policy__` checks the invoking signer
 * against `Allowance.signer`, set here). Order matters:
 *
 * 1. The policy must be installed as a wallet signer (`ensurePolicyInstalled`)
 *    before `policy__` will accept anything for this wallet at all.
 * 2. The sub-key is generated BEFORE `set_allowance` so its public key can be
 *    bound into the allowance record `policy__` checks against.
 * 3. The policy's `(wallet, merchant)` allowance must exist before the
 *    wallet grants a signer whose only authorization path runs through it,
 *    or the sub-key would be provisioned but unusable (every `policy__`
 *    check would fail with `NoAllowance`) for however long it takes the two
 *    txs to land.
 *
 * Called once, at the moment a merchant's mandate is FIRST manually
 * approved (see `messaging/handlers.ts`'s `txSignHandler`) — not at
 * allowance auto-create, so a merchant the user never approves never costs
 * a real on-chain signer slot.
 */
export async function provisionMerchantSubKey(
  authority: Keypair,
  merchant: string,
  tokenContractId: string,
  capPerTxAtomic: bigint,
  capPerDayAtomic: bigint,
  mandateSeconds: number,
): Promise<SubKeyProvisionResult> {
  if (!MERCHANT_SPEND_POLICY_CONTRACT_ID) {
    throw new Error(
      "MerchantSpendPolicy is not deployed yet — see contracts/contracts/merchant-spend-policy/DEPLOYMENT.md, then set MERCHANT_SPEND_POLICY_CONTRACT_ID in smart-wallet-config.ts.",
    );
  }
  await ensurePolicyInstalled(authority);

  const smartWalletAddress = await loadSmartWalletAddress();
  const networkPassphrase = getNetworkPassphrase();
  const rpcUrl = getSorobanRpcUrl();

  const subKey = Keypair.random();

  const policyClient = await SorobanClient.from<MerchantSpendPolicyClient>({
    contractId: MERCHANT_SPEND_POLICY_CONTRACT_ID,
    rpcUrl,
    networkPassphrase,
    publicKey: authority.publicKey(),
  });
  const setAllowanceTx = await policyClient.set_allowance({
    wallet: smartWalletAddress,
    merchant,
    signer: subKey.rawPublicKey(),
    cap_per_tx: capPerTxAtomic,
    cap_per_day: capPerDayAtomic,
    mandate_seconds: BigInt(mandateSeconds),
  });

  const kit = connectKit(smartWalletAddress, authority.publicKey());
  // `set_allowance` requires `wallet.require_auth()` — an address-credentials
  // auth entry for the smart wallet itself, not a classic source-account
  // signature. `kit.sign` finds and satisfies exactly that entry.
  const walletAuthorizedAllowance = await kit.sign(setAllowanceTx, new Ed25519Signer(authority));
  await walletAuthorizedAllowance.sign({
    signTransaction: basicNodeSigner(authority, networkPassphrase).signTransaction,
  });
  const allowanceSent = await walletAuthorizedAllowance.send();
  if (allowanceSent.getTransactionResponse?.status !== "SUCCESS") {
    throw new Error(
      `MerchantSpendPolicy.set_allowance failed on-chain: ${JSON.stringify(allowanceSent.getTransactionResponse ?? allowanceSent)}`,
    );
  }

  const expiresAt = Math.floor(Date.now() / 1000) + mandateSeconds;
  return buildAddSubKeyTransaction(authority, subKey, tokenContractId, expiresAt);
}

/**
 * Signs a single Soroban authorization entry addressed to the smart wallet
 * (address-credentials, not source-account) with `signer` — an authorized
 * wallet signer, either the admin `authority` or an active merchant sub-key.
 * Used for x402 payments, where the payer is now the smart wallet contract
 * itself: see `x402/build.ts#signX402Payment` and
 * `wallet-standard/handlers.ts#performSign`'s `"authEntry"` kind.
 *
 * `expiration`, if given, overrides the entry's own
 * `signatureExpirationLedger` — pass the same value the caller already
 * resolved (entry's own value, else a derived default) rather than letting
 * passkey-kit compute its own via a fresh RPC call.
 */
export async function signSmartWalletAuthEntry(
  entry: xdr.SorobanAuthorizationEntry,
  signer: Keypair,
  smartWalletAddress: string,
  expiration?: number,
): Promise<xdr.SorobanAuthorizationEntry> {
  const kit = connectKit(smartWalletAddress, signer.publicKey());
  return kit.signAuthEntry(
    entry,
    new Ed25519Signer(signer),
    expiration != null ? { expiration } : undefined,
  );
}

/**
 * Removes a sub-key from the smart wallet. Once confirmed, the sub-key's
 * private key can no longer authorize anything on this wallet at all — not
 * even within `MerchantSpendPolicy`'s cap, since `SignerLimits` enforcement
 * happens before the policy is ever consulted.
 */
export async function buildRemoveSubKeyTransaction(
  authority: Keypair,
  subKeyPubkey: string,
): Promise<string> {
  if (!StrKey.isValidEd25519PublicKey(subKeyPubkey)) {
    throw new Error(`Invalid sub-key address: ${subKeyPubkey}`);
  }
  const smartWalletAddress = await loadSmartWalletAddress();
  const networkPassphrase = getNetworkPassphrase();
  const kit = connectKit(smartWalletAddress, authority.publicKey());

  const tx = await kit.remove(SignerKey.Ed25519(subKeyPubkey));
  const walletAuthorized = await kit.sign(tx, new Ed25519Signer(authority));
  await walletAuthorized.sign({
    signTransaction: basicNodeSigner(authority, networkPassphrase).signTransaction,
  });

  const sent = await walletAuthorized.send();
  if (sent.getTransactionResponse?.status !== "SUCCESS") {
    throw new Error(
      `remove_signer failed on-chain: ${JSON.stringify(sent.getTransactionResponse ?? sent)}`,
    );
  }
  return sent.sendTransactionResponse?.hash ?? "";
}
