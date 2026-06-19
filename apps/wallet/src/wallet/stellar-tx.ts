/**
 * Stellar transaction helpers: build an unsigned payment envelope (so the
 * guard can analyze the XDR before any key touches it), then sign + optionally
 * submit. Mirrors the build/sign/submit pattern in apps/extension.
 */

import {
  Asset,
  BASE_FEE,
  Keypair,
  Memo,
  Operation,
  TransactionBuilder,
  type Networks,
} from "@stellar/stellar-sdk";
import { getHorizon, getNetworkPassphrase } from "./connection";

export interface BuildPaymentArgs {
  source: string;
  destination: string;
  /** XLM amount as a decimal string, e.g. "0.01". */
  amountXlm: string;
  memo?: string;
}

/** Build an unsigned native-XLM payment and return its base64 envelope XDR. */
export async function buildPaymentXdr(args: BuildPaymentArgs): Promise<string> {
  const horizon = getHorizon();
  const passphrase = getNetworkPassphrase();
  const sourceAccount = await horizon.loadAccount(args.source);

  let builder = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: passphrase as Networks,
  }).addOperation(
    Operation.payment({
      destination: args.destination,
      asset: Asset.native(),
      amount: Number(args.amountXlm).toFixed(7),
    }),
  );

  if (args.memo) builder = builder.addMemo(Memo.text(args.memo));

  return builder.setTimeout(120).build().toXDR();
}

export interface SignResult {
  signedXdr: string;
  /** Horizon tx hash when submitted, otherwise null. */
  hash: string | null;
}

/**
 * Sign a base64 envelope XDR with the authority keypair, then optionally submit
 * it to Horizon. Returns the signed XDR and (if submitted) the tx hash.
 */
export async function signAndMaybeSubmit(
  transactionXdr: string,
  authority: Keypair,
  submit: boolean,
): Promise<SignResult> {
  const passphrase = getNetworkPassphrase();
  const tx = TransactionBuilder.fromXDR(transactionXdr, passphrase as Networks);
  tx.sign(authority);
  const signedXdr = tx.toXDR();

  if (!submit) return { signedXdr, hash: null };

  const horizon = getHorizon();
  const result = await horizon.submitTransaction(tx);
  return { signedXdr, hash: result.hash };
}
