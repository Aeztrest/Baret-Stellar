/**
 * x402-Stellar exact-scheme payment client.
 *
 * This delegates to the reference `@x402/stellar` implementation rather than
 * hand-rolling the transaction. The exact scheme is **auth-entry based**:
 *   - The payer signs only the Soroban authorization entry (SEP-43
 *     `signAuthEntry`). NOT the whole transaction. The transaction source is
 *     a null account; the facilitator rebuilds it, wraps it in a fee-bump and
 *     submits. (A full-tx signature produces source-account credentials, which
 *     the facilitator rejects with `unsupported_credential_type`.)
 *   - No memo. Soroban transactions can't carry one.
 *   - The auth entry's `signatureExpirationLedger` is short (~maxTimeoutSeconds
 *     worth of ledgers); the wallet must honor it, not impose its own.
 *
 * The wallet is supplied as a SEP-43 signer ({@link X402Signer}) wired to the
 * connected provider's `signAuthEntry`.
 */

import {
  Address,
  Asset,
  BASE_FEE,
  contract,
  Horizon,
  nativeToScVal,
  Networks,
  Operation,
  rpc as sorobanRpc,
  TransactionBuilder,
  xdr,
  type Networks as NetworksType,
} from "@stellar/stellar-sdk";

export interface PaymentRequirements {
  scheme: string;
  network: string;
  /** Soroban Asset-Contract address (`C…`). */
  asset: string;
  /** Atomic units (stroops). */
  amount: string;
  /** Merchant address (G… or C…). */
  payTo: string;
  maxTimeoutSeconds: number;
  extra: {
    /** Required by the exact scheme. the facilitator sponsors the fee. */
    areFeesSponsored?: boolean;
    /** Facilitator's published fee signer (informational). */
    sponsorBy?: string;
    feePayer?: string;
    description?: string;
    [k: string]: unknown;
  };
}

/** SEP-43 signer the x402 client needs. Wired to the wallet's signAuthEntry. */
export interface X402Signer {
  address: string;
  signAuthEntry: (
    authEntry: string,
    opts?: { networkPassphrase?: string; address?: string },
  ) => Promise<{ signedAuthEntry: string; signerAddress?: string }>;
  signTransaction?: (
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string },
  ) => Promise<{ signedTxXdr: string; signerAddress?: string }>;
}

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const SOROBAN_RPC_TESTNET = "https://soroban-testnet.stellar.org";
/** x402 Stellar default: ~5s per ledger (matches the reference facilitator). */
const ESTIMATED_LEDGER_SECONDS = 5;

function passphraseFor(network: string): NetworksType {
  return network === "stellar:pubnet" ? Networks.PUBLIC : Networks.TESTNET;
}

/**
 * Build the base64 `PAYMENT-SIGNATURE` header value for an x402 payment.
 *
 * The exact scheme is auth-entry based: we build the Soroban `transfer` with a
 * null source account so the payer's `require_auth` resolves to an **address
 * credential** (not source-account credentials, which the facilitator rejects
 * as `unsupported_credential_type`). The payer signs only that auth entry.
 *
 * We bridge to the wallet through a custom `authorizeEntry` callback rather
 * than passing `signAuthEntry` to the SDK directly: the SDK's `signAuthEntry`
 * path hands the wallet a `HashIdPreimage` and expects a raw signature back,
 * but Freighter-style wallets (incl. BARET) take a full
 * `SorobanAuthorizationEntry` and return a signed entry. Passing the preimage
 * to such a wallet fails with `unknown SorobanCredentialsType member for value
 * 9`. The callback hands the wallet the full entry. its native convention.
 *
 * The entry's `signatureExpirationLedger` is set to a short window the
 * facilitator enforces; the wallet must honor it.
 */
export async function createX402PaymentHeader(
  signer: X402Signer,
  requirements: PaymentRequirements,
): Promise<string> {
  const networkPassphrase = passphraseFor(requirements.network);
  const rpc = new sorobanRpc.Server(SOROBAN_RPC_TESTNET);

  const { sequence } = await rpc.getLatestLedger();
  const maxLedger =
    sequence +
    Math.ceil((requirements.maxTimeoutSeconds || 60) / ESTIMATED_LEDGER_SECONDS);

  // Source is left as the SDK's null account → the payer authorizes via an
  // address-credential auth entry the facilitator can verify and re-submit.
  const tx = await contract.AssembledTransaction.build({
    contractId: requirements.asset,
    method: "transfer",
    args: [
      nativeToScVal(Address.fromString(signer.address), { type: "address" }),
      nativeToScVal(Address.fromString(requirements.payTo), { type: "address" }),
      nativeToScVal(BigInt(requirements.amount), { type: "i128" }),
    ],
    networkPassphrase,
    rpcUrl: SOROBAN_RPC_TESTNET,
    parseResultXdr: (r) => r,
  });

  const pending = tx.needsNonInvokerSigningBy();
  if (!pending.includes(signer.address)) {
    throw new Error(
      `Payment can't be authorized by your wallet. the transaction needs [${pending.join(", ") || "no one"}], not ${signer.address}.`,
    );
  }

  await tx.signAuthEntries({
    address: signer.address,
    expiration: maxLedger,
    authorizeEntry: async (entry) => {
      entry.credentials().address().signatureExpirationLedger(maxLedger);
      const { signedAuthEntry } = await signer.signAuthEntry(
        entry.toXDR("base64"),
        { networkPassphrase, address: signer.address },
      );
      return xdr.SorobanAuthorizationEntry.fromXDR(signedAuthEntry, "base64");
    },
  });

  // Refresh simulation with the signed auth entry; confirm nothing else is
  // pending before shipping the payload.
  await tx.simulate();
  const stillPending = tx.needsNonInvokerSigningBy();
  if (stillPending.length > 0) {
    throw new Error(
      `Auth entries still unsigned after signing: [${stillPending.join(", ")}].`,
    );
  }

  if (!tx.built) {
    throw new Error("Payment transaction failed to assemble after signing.");
  }
  const payload = { transaction: tx.built.toXDR() };
  return btoa(
    JSON.stringify({ x402Version: 2, accepted: requirements, payload }),
  );
}

/* ───────── USDC trustline setup ─────────
 *
 * A fresh Stellar account can't hold USDC until it trusts the issuer. Without
 * the trustline the SAC `transfer` aborts with `Error(Contract, #13)`.  * "trustline entry is missing". These helpers let the Scrybe page detect that
 * and establish the trustline with a one-tap classic `changeTrust` tx before
 * the user funds via the Circle faucet.
 */

/** Circle's testnet USDC issuer. Its SAC is the contract Scrybe charges in. */
export const USDC_TESTNET_ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

function usdcTestnetAsset(): Asset {
  return new Asset("USDC", USDC_TESTNET_ISSUER);
}

export interface UsdcStatus {
  /** Account exists on testnet (funded with XLM). */
  accountExists: boolean;
  /** A USDC trustline is established. */
  hasTrustline: boolean;
  /** USDC balance as a decimal string (e.g. "0.0000000"). */
  balance: string;
}

/** Inspect an account's USDC readiness on testnet. */
export async function getUsdcStatus(address: string): Promise<UsdcStatus> {
  const horizon = new Horizon.Server(HORIZON_TESTNET);
  let account: Awaited<ReturnType<Horizon.Server["loadAccount"]>>;
  try {
    account = await horizon.loadAccount(address);
  } catch {
    return { accountExists: false, hasTrustline: false, balance: "0" };
  }
  const line = account.balances.find(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === "USDC" &&
      b.asset_issuer === USDC_TESTNET_ISSUER,
  );
  return {
    accountExists: true,
    hasTrustline: !!line,
    balance: line && "balance" in line ? line.balance : "0",
  };
}

/** Build an unsigned `changeTrust` tx establishing the USDC trustline. */
export async function buildUsdcTrustlineTx(
  address: string,
  networkPassphrase: string,
): Promise<string> {
  const horizon = new Horizon.Server(HORIZON_TESTNET);
  const account = await horizon.loadAccount(address);
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase as NetworksType,
  })
    .addOperation(Operation.changeTrust({ asset: usdcTestnetAsset() }))
    .setTimeout(120)
    .build()
    .toXDR();
}

/** Broadcast a signed tx XDR to Horizon testnet; returns the tx hash. */
export async function submitToHorizon(
  signedTxXdr: string,
  networkPassphrase: string,
): Promise<string> {
  const horizon = new Horizon.Server(HORIZON_TESTNET);
  const tx = TransactionBuilder.fromXDR(
    signedTxXdr,
    networkPassphrase as NetworksType,
  );
  const res = await horizon.submitTransaction(tx);
  return res.hash;
}

