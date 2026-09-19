import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Operation,
  TransactionBuilder,
  type xdr,
} from "@stellar/stellar-sdk";
import type { Meta } from "./api";
import { loadSampleAccount, saveSampleAccount } from "./hooks";

/**
 * Ready-made transactions for the playground: one ordinary payment and a few
 * of the attacks Baret exists to catch. They are only ever *analysed*, never
 * signed or submitted, so nothing here needs a secret key — the browser keeps
 * just the public address of a throwaway, Friendbot-funded testnet account.
 */

export type SampleId = "payment" | "takeover" | "merge" | "trustline";

export type Sample = {
  id: SampleId;
  title: string;
  /** What the transaction does, in one plain sentence. */
  blurb: string;
  /** The lesson: what a careless wallet would do with it. */
  threat: string;
  danger: boolean;
  build: (source: string, meta: Meta) => string;
};

function envelope(source: string, op: xdr.Operation, meta: Meta): string {
  return new TransactionBuilder(new Account(source, "0"), {
    fee: BASE_FEE,
    networkPassphrase: meta.network.passphrase,
  })
    .addOperation(op)
    .setTimeout(300)
    .build()
    .toXDR();
}

export const SAMPLES: Sample[] = [
  {
    id: "payment",
    title: "Ordinary payment",
    blurb: "Send 25 XLM to another account.",
    threat: "Nothing wrong here. A firewall that cries wolf is useless, so this should pass.",
    danger: false,
    build: (source, meta) =>
      envelope(
        source,
        Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: "25" }),
        meta,
      ),
  },
  {
    id: "takeover",
    title: "Account takeover",
    blurb: "Add an unknown key with full signing weight, then switch off your own key.",
    threat: "One click and you can never sign for your own account again; a stranger can.",
    danger: true,
    build: (source, meta) =>
      envelope(
        source,
        Operation.setOptions({
          masterWeight: 0,
          signer: { ed25519PublicKey: Keypair.random().publicKey(), weight: 255 },
        }),
        meta,
      ),
  },
  {
    id: "merge",
    title: "Account drain",
    blurb: "Merge your account into someone else's.",
    threat: "Your whole XLM balance moves in one operation and the account is closed for good.",
    danger: true,
    build: (source, meta) =>
      envelope(source, Operation.accountMerge({ destination: Keypair.random().publicKey() }), meta),
  },
  {
    id: "trustline",
    title: "Unlimited trustline",
    blurb: "Open a trustline to USDC at the maximum limit.",
    threat: "Harmless-looking, but it removes the cap on how much of an asset can be pushed to you.",
    danger: true,
    build: (source, meta) =>
      envelope(
        source,
        Operation.changeTrust({ asset: new Asset(meta.usdc.code, meta.usdc.issuer) }),
        meta,
      ),
  },
];

/** Samples need a funded account (balance rules use its balance) and Friendbot only exists on testnet. */
export const samplesAvailable = (meta: Meta) => meta.network.name === "testnet";

export type SampleAccountStep = "creating" | "funding";

/**
 * Returns a funded testnet account, creating and funding one on first use.
 * Reuses the remembered one if it still exists on the network.
 */
export async function ensureSampleAccount(
  onStep?: (step: SampleAccountStep) => void,
): Promise<string> {
  const remembered = loadSampleAccount();
  if (remembered && (await accountExists(remembered))) return remembered;

  onStep?.("creating");
  const address = Keypair.random().publicKey();
  onStep?.("funding");
  const res = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
  if (!res.ok) {
    throw new Error(
      "Friendbot (the testnet faucet) didn't fund the sample account. It is sometimes busy; try again in a moment.",
    );
  }
  saveSampleAccount(address);
  return address;
}

async function accountExists(address: string): Promise<boolean> {
  try {
    const r = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
    return r.ok;
  } catch {
    // Can't tell (offline?): trust what we remembered.
    return true;
  }
}
