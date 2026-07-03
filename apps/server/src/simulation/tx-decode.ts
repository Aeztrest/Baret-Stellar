import {
  FeeBumpTransaction,
  Transaction,
  TransactionBuilder,
  type Networks,
} from "@stellar/stellar-sdk";

/**
 * Decodes a base64-encoded `TransactionEnvelope` XDR into a Stellar
 * `Transaction` or `FeeBumpTransaction`. The network passphrase is required
 * so the parsed tx can be safely re-built / signed later. the SDK refuses
 * to operate on a passphrase-less envelope.
 */
export function decodeStellarTransactionXdr(
  xdrBase64: string,
  networkPassphrase: string,
): Transaction | FeeBumpTransaction {
  return TransactionBuilder.fromXDR(xdrBase64, networkPassphrase as Networks);
}

export function isFeeBumpTransaction(
  tx: Transaction | FeeBumpTransaction,
): tx is FeeBumpTransaction {
  return tx instanceof FeeBumpTransaction;
}

/**
 * Unwraps fee-bump envelopes to the inner tx. analysis is done on the
 * inner tx (the inner is what actually mutates state); the outer only
 * supplies a different fee source.
 */
export function unwrapInnerTransaction(
  tx: Transaction | FeeBumpTransaction,
): Transaction {
  return isFeeBumpTransaction(tx) ? tx.innerTransaction : tx;
}
