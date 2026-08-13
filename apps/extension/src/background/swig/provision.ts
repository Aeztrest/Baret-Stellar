/**
 * Smart-wallet provisioning (Stellar build).
 *
 * Deploys a real passkey-kit smart-wallet contract instance
 * (`stellar/passkey-kit`, canonical WASM — see `smart-wallet-config.ts`)
 * with the account's existing ed25519 authority key as the wallet's first
 * (durable, unlimited) admin signer. No WebAuthn/passkey enrollment: the
 * constructor's `Signer` can be any kind (Ed25519, Secp256r1, or Policy —
 * see `contracts/smart-wallet/src/lib.rs`'s `__constructor`), and a
 * live testnet deploy with an Ed25519 constructor signer is the reference
 * example in the WASM's own deployment manifest.
 *
 * The authority keypair plays two roles here, same as in that reference
 * deploy: it pays for + submits the deploy transaction (classic envelope
 * signature, since it's also the transaction's source account), and it
 * becomes the wallet's admin Soroban signer. Using our own already-unlocked,
 * already-funded authority as the deployer — instead of passkey-kit's
 * shared canonical "kalepail" deployer — means we don't depend on an
 * external account's funding, and we don't need passkey-kit's keyId-based
 * discovery convention (`AccountEntry.smartWalletAddress` is our own
 * source of truth for the deployed address, not indexer lookup).
 *
 * Spec: docs/wallet-spec.md §9.6, docs/x402-defense.md §11.
 *
 * Idempotent. if a smart-wallet address already lives in the keystore
 * row, returns it without sending a new transaction.
 */

import { Horizon, Keypair, hash } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { PasskeyClient, deriveContractAddress } from "passkey-kit";
import type { Signer as SDKSigner } from "passkey-kit-sdk";

import { activeAccountEntry, readKeystore, updateAccountEntry } from "../db/keystore";
import { getActiveIndex, useAuthority } from "../crypto/session";
import { getNetworkPassphrase, getSorobanRpcUrl } from "../rpc/connection";
import { SMART_WALLET_WASM_HASH } from "./smart-wallet-config";

export interface ProvisionResult {
  smartWalletAddress: string;
  walletAddress: string;
  alreadyOnChain: boolean;
}

const MIN_RENT_BUDGET_STROOPS = 50_000_000n; // 5 XLM
const DEPLOY_TIMEOUT_SECONDS = 30; // matches passkey-kit's own default / relayer ceiling

/** Provisions a smart wallet for the currently ACTIVE account (see `crypto/session.ts`). */
export async function provisionSmartWallet(
  horizon: Horizon.Server,
): Promise<ProvisionResult> {
  const row = await readKeystore();
  if (!row) throw new Error("No wallet found.");
  const acct = activeAccountEntry(row);

  if (acct.smartWalletAddress) {
    return {
      smartWalletAddress: acct.smartWalletAddress,
      walletAddress: acct.smartWalletAddress,
      alreadyOnChain: true,
    };
  }

  // Authority must be unlocked + funded: it pays for its own deploy.
  const authority = useAuthority();
  const authorityAddress = authority.publicKey();

  const horizonAccount = await horizon.loadAccount(authorityAddress).catch(() => null);
  if (!horizonAccount) {
    throw new Error(
      `Authority ${authorityAddress} not funded on-chain. run an airdrop first.`,
    );
  }
  const nativeBalance =
    horizonAccount.balances.find((b) => b.asset_type === "native")?.balance ?? "0";
  if (decimalXlmToStroops(nativeBalance) < MIN_RENT_BUDGET_STROOPS) {
    throw new Error(
      `Authority needs ≥ ${MIN_RENT_BUDGET_STROOPS / 10_000_000n} XLM to deploy the smart wallet. Run an airdrop first.`,
    );
  }

  const smartWalletAddress = await deploySmartWallet(authority);

  await updateAccountEntry(row, getActiveIndex(), { smartWalletAddress });

  return {
    smartWalletAddress,
    walletAddress: smartWalletAddress,
    alreadyOnChain: false,
  };
}

/**
 * Builds, signs, and submits the wallet's `__constructor` deploy
 * transaction with `authority` as both the fee-paying source account and
 * the wallet's first (durable, unlimited) Ed25519 signer.
 */
async function deploySmartWallet(authority: Keypair): Promise<string> {
  const networkPassphrase = getNetworkPassphrase();
  const rpcUrl = getSorobanRpcUrl();
  const authorityRawPublicKey = authority.rawPublicKey();

  const signer: SDKSigner = {
    tag: "Ed25519",
    values: [
      authorityRawPublicKey,
      [undefined], // SignerExpiration: durable, never expires
      [undefined], // SignerLimits: unlimited (full admin)
      { tag: "Persistent", values: undefined },
    ],
  };

  const at = await PasskeyClient.deploy(
    { signer },
    {
      rpcUrl,
      wasmHash: SMART_WALLET_WASM_HASH,
      networkPassphrase,
      publicKey: authorityAddress(authority),
      // Mirrors passkey-kit's `salt = hash(keyId)` convention, substituting
      // our own key material for the (absent, since we're not using
      // WebAuthn) passkey credential id — still a deterministic salt tied
      // to this account's own identity.
      salt: hash(authorityRawPublicKey),
      timeoutInSeconds: DEPLOY_TIMEOUT_SECONDS,
    },
  );

  const contractId = at.result.options.contractId;
  if (!contractId) {
    throw new Error("Smart-wallet deploy did not resolve a contract id.");
  }

  await at.sign({
    signTransaction: basicNodeSigner(authority, networkPassphrase).signTransaction,
  });
  if (!at.signed) {
    throw new Error("Smart-wallet deploy transaction failed to sign.");
  }

  const sendResult = await at.send();
  if (sendResult.getTransactionResponse?.status !== "SUCCESS") {
    throw new Error(
      `Smart-wallet deploy failed on-chain: ${JSON.stringify(sendResult.getTransactionResponse ?? sendResult)}`,
    );
  }

  // Sanity check: the address we derive locally must match what the
  // network actually assigned — catches a salt/deployer mismatch early
  // rather than trusting `at.result.options.contractId` blindly.
  const derived = deriveContractAddress(
    Buffer.from(authorityRawPublicKey),
    authorityAddress(authority),
    networkPassphrase,
  );
  if (derived !== contractId) {
    throw new Error(
      `Smart-wallet address mismatch: deploy returned ${contractId}, locally derived ${derived}.`,
    );
  }

  return contractId;
}

function authorityAddress(authority: Keypair): string {
  return authority.publicKey();
}

function decimalXlmToStroops(decimal: string): bigint {
  const [whole, frac = ""] = decimal.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole ?? "0") * 10_000_000n + BigInt(fracPadded || "0");
}
