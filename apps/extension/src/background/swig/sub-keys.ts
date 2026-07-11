/**
 * Smart-wallet sub-key add / remove builders (Stellar build).
 *
 * Stellar version: sub-keys are additional ed25519 signers on the user's
 * smart-wallet contract (Passkey Kit + custom allowance contract). The
 * smart wallet exposes:
 *   - `add_signer(signer, allowance)`. register a new signer with caps.
 *   - `remove_signer(signer)`. drop the signer.
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
import { activeAccountEntry, readKeystore } from "../db/keystore";

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
 * additional signer on the user's smart wallet.
 *
 * SECURITY NOTE: the allowance struct below is `{ unlimited: true }` — the
 * smart-wallet contract deployed today has no per-signer spending-cap
 * enforcement, so this signer has NO on-chain spending limit at all. The
 * per-tx/hourly/daily caps this wallet enforces (see `tryReserveSpend` in
 * `../db/allowances.ts`) are purely off-chain, JS-side bookkeeping in this
 * extension. If a sub-key's encrypted secret is ever exfiltrated and
 * decrypted outside the extension, the attacker can sign an arbitrary
 * `transfer` directly against the smart wallet with no on-chain ceiling —
 * NOT capped to "this merchant only." Do not present this as a real
 * blast-radius guarantee anywhere in the UI or docs until the deployed
 * contract actually accepts and enforces a bounded allowance here.
 */
export async function buildAddSubKeyTransaction(
  sorobanServer: sorobanRpc.Server,
  authority: Keypair,
  subKey: Keypair,
  networkPassphrase: string,
): Promise<SubKeyProvisionResult> {
  const row = await readKeystore();
  if (!row) throw new Error("No wallet keystore");
  const smartWalletAddress = activeAccountEntry(row).smartWalletAddress;
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
    .addMemo(Memo.text("baret:add_signer"))
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
  const smartWalletAddress = activeAccountEntry(row).smartWalletAddress;
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
    .addMemo(Memo.text("baret:remove_signer"))
    .setTimeout(60);

  const tx = builder.build();
  const sim = await sorobanServer.simulateTransaction(tx);
  if (sorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Preflight failed (remove_signer): ${sim.error}`);
  }
  const assembled = sorobanRpc.assembleTransaction(tx, sim).build();
  return assembled.toXDR();
}
