/**
 * Build an x402-Stellar exact-scheme payment (auth-entry based).
 *
 * The exact scheme is NOT full-transaction signing. We build the Soroban
 * `transfer(from, to, amount)` with the SDK's **null source account**, so the
 * payer's `require_auth` resolves to an **address-credential** authorization
 * entry (not source-account credentials, which the facilitator rejects as
 * `unsupported_credential_type`). The payer signs only that auth entry; the
 * facilitator rebuilds the transaction, wraps it in a fee-bump and submits.
 *
 * This returns the UNSIGNED assembled tx plus the `maxLedger` the auth entry's
 * `signatureExpirationLedger` must be set to when signing. The signing happens
 * in `performSign` (kind `"x402Payment"`) after the user approves in the popup.
 */

import {
  Address,
  contract,
  nativeToScVal,
  rpc as sorobanRpc,
  StrKey,
  xdr,
  type Keypair,
} from "@stellar/stellar-sdk";
import { signSmartWalletAuthEntry } from "../swig/sub-keys";
import type { PaymentRequirements } from "./parse";

/** x402 Stellar default: ~5s per ledger (matches the reference facilitator). */
const ESTIMATED_LEDGER_SECONDS = 5;

export interface BuiltPayment {
  /** Unsigned assembled inner tx XDR (base64); null source, address-cred auth. */
  transactionXdr: string;
  /** Ledger the auth entry's signature must expire by (facilitator-enforced). */
  maxLedger: number;
}

export async function buildX402Payment(
  payerAddress: string,
  requirements: PaymentRequirements,
  rpcUrl: string,
  networkPassphrase: string,
): Promise<BuiltPayment> {
  if (!StrKey.isValidContract(requirements.asset)) {
    throw new Error(
      `requirements.asset must be a Stellar contract address (C…); got ${requirements.asset}`,
    );
  }

  const rpc = new sorobanRpc.Server(rpcUrl);
  const { sequence } = await rpc.getLatestLedger();
  const maxLedger =
    sequence +
    Math.ceil((requirements.maxTimeoutSeconds || 60) / ESTIMATED_LEDGER_SECONDS);

  // Null source → the payer authorizes via an address-credential auth entry
  // the facilitator can verify and re-submit under its own fee-bump.
  const tx = await contract.AssembledTransaction.build({
    contractId: requirements.asset,
    method: "transfer",
    args: [
      nativeToScVal(Address.fromString(payerAddress), { type: "address" }),
      nativeToScVal(Address.fromString(requirements.payTo), { type: "address" }),
      nativeToScVal(BigInt(requirements.amount), { type: "i128" }),
    ],
    networkPassphrase,
    rpcUrl,
    parseResultXdr: (r) => r,
  });

  const pending = tx.needsNonInvokerSigningBy();
  if (!pending.includes(payerAddress)) {
    throw new Error(
      `x402 payment can't be authorized by your wallet. tx needs [${pending.join(", ") || "no one"}], not ${payerAddress}.`,
    );
  }
  if (!tx.built) {
    throw new Error("x402 payment transaction failed to assemble.");
  }

  return { transactionXdr: tx.built.toXDR(), maxLedger };
}

/**
 * Sign the smart wallet's ADDRESS-credential auth entry inside an unsigned
 * x402 transfer. NOT the transaction envelope. The facilitator rebuilds,
 * fee-bumps and submits, so an envelope signature would be wrong and
 * source-account credentials are rejected.
 *
 * The payer is the smart wallet contract itself (see `buildX402Payment`),
 * so `signer` — the wallet's admin `authority` or an active merchant
 * sub-key, either way just ONE of possibly several authorized signers —
 * can't sign the entry directly the way a classic account would. It goes
 * through the wallet's own `__check_auth` via
 * `swig/sub-keys.ts#signSmartWalletAuthEntry` (passkey-kit's
 * `signAuthEntry`), which is why entries are matched against
 * `smartWalletAddress`, not `signer`'s own address.
 *
 * Used by both the popup sign path (`performSign`) and the policy-driven
 * background auto-approve path (`x402Review`).
 */
export async function signX402Payment(
  unsignedTxXdr: string,
  signer: Keypair,
  smartWalletAddress: string,
  validUntilLedger: number,
): Promise<string> {
  const env = xdr.TransactionEnvelope.fromXDR(unsignedTxXdr, "base64");
  const op0 = env.v1().tx().operations()[0];
  if (!op0) throw new Error("x402 payment tx has no operation to authorize.");
  const ihfOp = op0.body().invokeHostFunctionOp();
  const signedAuth: xdr.SorobanAuthorizationEntry[] = [];
  for (const entry of ihfOp.auth()) {
    const creds = entry.credentials();
    const isWalletAddressCred =
      creds.switch() ===
        xdr.SorobanCredentialsType.sorobanCredentialsAddress() &&
      Address.fromScAddress(creds.address().address()).toString() ===
        smartWalletAddress;
    signedAuth.push(
      isWalletAddressCred
        ? await signSmartWalletAuthEntry(entry, signer, smartWalletAddress, validUntilLedger)
        : entry,
    );
  }
  ihfOp.auth(signedAuth);
  return env.toXDR("base64");
}
