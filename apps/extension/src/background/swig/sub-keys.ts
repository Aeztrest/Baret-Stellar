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

import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
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

export interface SubKeyProvisionResult {
  /** Newly generated sub-key keypair. Caller persists this (encrypted). */
  subKey: Keypair;
  /** Smart-wallet contract address (`C…`). */
  smartWalletAddress: string;
  /** On-chain signature of the `add_signer` transaction. */
  signature: string;
}

async function loadSmartWalletAddress(): Promise<string> {
  const row = await readKeystore();
  if (!row) throw new Error("No wallet keystore");
  const smartWalletAddress = activeAccountEntry(row).smartWalletAddress;
  if (!smartWalletAddress || !StrKey.isValidContract(smartWalletAddress)) {
    throw new Error("Smart-wallet contract address missing or invalid");
  }
  return smartWalletAddress;
}

/** Connects a `PasskeyKit` to an already-deployed wallet, bypassing the WebAuthn `connectWallet` ceremony — we know our own contract address from the keystore. */
function connectKit(smartWalletAddress: string, authorityPublicKey: string): PasskeyKit {
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
