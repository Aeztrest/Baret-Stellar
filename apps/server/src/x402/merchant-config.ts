/**
 * Merchant identity used by the demo paywall (apps/server/src/api/routes/demo-paywall.ts).
 *
 * Lives in env so the merchant key persists across server restarts.
 * `pnpm --filter @stellar-thorn/server x402-setup` generates and persists the
 * keypair + funds it on testnet (one-time, idempotent).
 */

import { Keypair, StrKey } from "@stellar/stellar-sdk";

/**
 * Soroban Asset Contract (SAC) addresses for Circle's USDC, the asset x402
 * facilitators settle in. Classic G… issuers are not relevant here —
 * the protocol uses the contract address for state-changing flows.
 */
const USDC_CONTRACT_TESTNET =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const USDC_CONTRACT_PUBNET =
  "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";

export type StellarX402Network = "stellar:testnet" | "stellar:pubnet";

export interface MerchantConfig {
  /** Stellar `S…` ed25519 seed. */
  merchantSecret: string;
  /** Hydrated SDK keypair (private key never leaves the process). */
  merchantKeypair: Keypair;
  /** Merchant `G…` public address. */
  merchantPubkey: string;
  /** Built-on-Stellar facilitator URL. */
  facilitatorUrl: string;
  /** CAIP-2 network id. */
  network: StellarX402Network;
  /** Soroban USDC SAC address to charge in. */
  usdcContractAddress: string;
  /** Per-question price in atomic units (7-decimal stroops). */
  priceAtomic: string;
}

export class MerchantConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MerchantConfigError";
  }
}

let cached: MerchantConfig | null = null;

export function loadMerchantConfig(
  env: NodeJS.ProcessEnv = process.env,
): MerchantConfig {
  if (cached) return cached;

  const merchantSecret = env.X402_MERCHANT_SECRET?.trim();
  if (!merchantSecret) {
    throw new MerchantConfigError(
      "X402_MERCHANT_SECRET missing. Run `pnpm --filter @stellar-thorn/server x402-setup` to generate one.",
    );
  }
  if (!StrKey.isValidEd25519SecretSeed(merchantSecret)) {
    throw new MerchantConfigError(
      `X402_MERCHANT_SECRET is not a valid Stellar S… seed.`,
    );
  }

  let merchantKeypair: Keypair;
  try {
    merchantKeypair = Keypair.fromSecret(merchantSecret);
  } catch (err) {
    throw new MerchantConfigError(
      `Failed to hydrate merchant keypair: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const network = (env.X402_DEMO_NETWORK ??
    "stellar:testnet") as StellarX402Network;
  if (network !== "stellar:testnet" && network !== "stellar:pubnet") {
    throw new MerchantConfigError(
      `Unsupported X402_DEMO_NETWORK: ${network} (expected stellar:testnet or stellar:pubnet)`,
    );
  }

  const usdcContractAddress =
    network === "stellar:pubnet" ? USDC_CONTRACT_PUBNET : USDC_CONTRACT_TESTNET;

  const facilitatorUrl =
    env.X402_FACILITATOR_URL?.trim() || "https://www.x402.org/facilitator";

  // Default: 0.001 USDC. Stellar uses 7-decimal precision → 10_000 stroops.
  const priceAtomic = env.X402_DEMO_PRICE_ATOMIC?.trim() || "10000";

  cached = {
    merchantSecret,
    merchantKeypair,
    merchantPubkey: merchantKeypair.publicKey(),
    facilitatorUrl,
    network,
    usdcContractAddress,
    priceAtomic,
  };
  return cached;
}
