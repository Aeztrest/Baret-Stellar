/**
 * Smart-wallet sub-key add / remove builders (Stellar build).
 *
 * Stellar version: sub-keys are additional ed25519 signers on the user's
 * smart-wallet contract (Passkey Kit + custom allowance contract). The
 * smart wallet exposes:
 *   - `add_signer(signer, allowance)` — register a new signer with caps.
 *   - `remove_signer(signer)` — drop the signer.
 *
 * Both functions return an unsigned preflighted `Transaction` (as XDR) with
 * the main authority as tx source. The sign queue routes them through the
 * popup (kind="transaction") so the user explicitly approves each on-chain
 * change.
 *
 * The exact `add_signer` / `remove_signer` interface depends on which
 * smart-wallet contract is deployed; this module wires the call shape but
 * the contract address is supplied by the keystore.
 */

import {
  Address,
  BASE_FEE,
  Contract,
  Memo,
  nativeToScVal,
  rpc as sorobanRpc,
  StrKey,
  TransactionBuilder,
  type Keypair,
  type Networks,
} from "@stellar/stellar-sdk";
import { readKeystore } from "../db/keystore";

export interface SubKeyProvisionResult {
  /** Preflighted tx XDR (base64) ready for signing + submission. */
  transactionXdr: string;
  /** Newly generated sub-key keypair. Caller persists this (encrypted). */
  subKey: Keypair;
  /** Smart-wallet contract address (`C…`). */
  smartWalletAddress: string;
}

/**
 * Build the `add_signer` invocation that registers `subKey` as an
 * additional signer on the user's smart wallet. `allowance` carries the
 * per-merchant caps (max-per-tx, hourly, daily) the contract enforces
 * on-chain — leaving v1 caps wide open and relying on the off-chain policy
 * gate as a stop-gap until the on-chain caps land.
 */
export async function buildAddSubKeyTransaction(
  sorobanServer: sorobanRpc.Server,
  authority: Keypair,
  subKey: Keypair,
  networkPassphrase: string,
): Promise<SubKeyProvisionResult> {
  const row = await readKeystore();
  if (!row) throw new Error("No wallet keystore");
  const smartWalletAddress = row.smartWalletAddress;
  if (!smartWalletAddress || !StrKey.isValidContract(smartWalletAddress)) {
    throw new Error("Smart-wallet contract address missing or invalid");
  }

  const contract = new Contract(smartWalletAddress);
  const op = contract.call(
    "add_signer",
    nativeToScVal(Address.fromString(subKey.publicKey()), { type: "address" }),
    // Placeholder allowance struct: unlimited until the on-chain caps land.
    nativeToScVal({ unlimited: true }, { type: "map" }),
  );

  const account = await sorobanServer.getAccount(authority.publicKey());
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase as Networks,
  })
    .addOperation(op)
    .addMemo(Memo.text("blackthorn:add_signer"))
    .setTimeout(60);

  const tx = builder.build();
  const sim = await sorobanServer.simulateTransaction(tx);
  if (sorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Preflight failed (add_signer): ${sim.error}`);
  }
  const assembled = sorobanRpc.assembleTransaction(tx, sim).build();

  return {
    transactionXdr: assembled.toXDR(),
    subKey,
    smartWalletAddress,
  };
}

/**
 * Build the `remove_signer` invocation that drops a sub-key from the
 * smart wallet. Once confirmed, the sub-key's private key is useless for
 * spending against the contract.
 */
export async function buildRemoveSubKeyTransaction(
  sorobanServer: sorobanRpc.Server,
  authority: Keypair,
  subKeyPubkey: string,
  networkPassphrase: string,
): Promise<string> {
  const row = await readKeystore();
  if (!row) throw new Error("No wallet keystore");
  const smartWalletAddress = row.smartWalletAddress;
  if (!smartWalletAddress || !StrKey.isValidContract(smartWalletAddress)) {
    throw new Error("Smart-wallet contract address missing or invalid");
  }
  if (!StrKey.isValidEd25519PublicKey(subKeyPubkey)) {
    throw new Error(`Invalid sub-key address: ${subKeyPubkey}`);
  }

  const contract = new Contract(smartWalletAddress);
  const op = contract.call(
    "remove_signer",
    nativeToScVal(Address.fromString(subKeyPubkey), { type: "address" }),
  );

  const account = await sorobanServer.getAccount(authority.publicKey());
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase as Networks,
  })
    .addOperation(op)
    .addMemo(Memo.text("blackthorn:remove_signer"))
    .setTimeout(60);

  const tx = builder.build();
  const sim = await sorobanServer.simulateTransaction(tx);
  if (sorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Preflight failed (remove_signer): ${sim.error}`);
  }
  const assembled = sorobanRpc.assembleTransaction(tx, sim).build();
  return assembled.toXDR();
}
