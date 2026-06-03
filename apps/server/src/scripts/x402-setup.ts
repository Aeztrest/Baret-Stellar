/**
 * One-time setup CLI for the x402 demo paywall.
 *
 * Generates (if missing) a merchant Stellar keypair, funds it via friendbot
 * on testnet, and writes the values back to `.env`. Idempotent — running
 * twice is safe.
 *
 * Usage: pnpm --filter @stellar-thorn/server x402-setup
 *
 * Production note: friendbot only exists on testnet; for pubnet you must
 * fund the merchant manually (e.g. via Coinbase / Kraken / DEX swap) before
 * running the demo.
 */

import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const HORIZON_PUBNET = "https://horizon.stellar.org";
const FRIENDBOT_URL = "https://friendbot.stellar.org";
const ENV_PATH = join(process.cwd(), ".env");

// Circle's USDC issuers. The merchant must trust the issuer to receive USDC —
// a Stellar SAC `transfer` aborts with Contract #13 ("trustline entry is
// missing") unless the recipient holds a trustline for the asset.
const USDC_ISSUER_TESTNET =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const USDC_ISSUER_PUBNET =
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

async function main(): Promise<void> {
  loadEnv({ path: ENV_PATH });

  const networkRaw = process.env.X402_DEMO_NETWORK ?? "stellar:testnet";
  if (networkRaw !== "stellar:testnet" && networkRaw !== "stellar:pubnet") {
    console.error(
      `✗ Unsupported X402_DEMO_NETWORK '${networkRaw}'. Use stellar:testnet or stellar:pubnet.`,
    );
    process.exit(1);
  }
  const network = networkRaw as "stellar:testnet" | "stellar:pubnet";
  const horizon = new Horizon.Server(
    network === "stellar:pubnet" ? HORIZON_PUBNET : HORIZON_TESTNET,
  );

  // Step 1 — load or generate merchant keypair.
  let merchantSecret = process.env.X402_MERCHANT_SECRET?.trim();
  let merchant: Keypair;
  let generated = false;

  if (merchantSecret) {
    if (!StrKey.isValidEd25519SecretSeed(merchantSecret)) {
      console.error(
        "✗ X402_MERCHANT_SECRET in .env is not a valid Stellar S… seed. Remove it and rerun to regenerate.",
      );
      process.exit(1);
    }
    merchant = Keypair.fromSecret(merchantSecret);
    console.log(
      `✓ Loaded existing merchant from .env (${merchant.publicKey().slice(0, 8)}…)`,
    );
  } else {
    merchant = Keypair.random();
    merchantSecret = merchant.secret();
    generated = true;
    console.log(
      `✓ Generated new merchant keypair (${merchant.publicKey().slice(0, 8)}…)`,
    );
    persistSecretEarly(merchantSecret, merchant.publicKey());
    console.log(`  → saved to .env (rerun-safe)`);
  }

  // Step 2 — make sure the account exists on-chain.
  let exists = await accountExists(horizon, merchant.publicKey());
  if (!exists) {
    if (network !== "stellar:testnet") {
      console.error(
        `✗ Merchant ${merchant.publicKey()} does not exist on pubnet. Fund it manually (e.g. send ≥ 5 XLM from any wallet) then rerun.`,
      );
      process.exit(1);
    }
    console.log("  Funding via friendbot…");
    const res = await fetch(
      `${FRIENDBOT_URL}?addr=${encodeURIComponent(merchant.publicKey())}`,
    );
    if (!res.ok) {
      const body = await safeText(res);
      console.error(
        `✗ Friendbot funding failed (${res.status}): ${body || "no body"}.`,
      );
      console.error(
        `  You can also fund manually at https://laboratory.stellar.org/#account-creator`,
      );
      process.exit(1);
    }
    console.log("  ✓ Friendbot funded");
    exists = await accountExists(horizon, merchant.publicKey());
  } else {
    console.log("✓ Merchant account exists on-chain");
  }

  // Step 2b — establish the merchant's USDC trustline so it can RECEIVE USDC.
  // Without it the SAC `transfer` aborts with Contract #13 on the merchant
  // side. Idempotent: skipped if the trustline already exists.
  const usdcIssuer =
    network === "stellar:pubnet" ? USDC_ISSUER_PUBNET : USDC_ISSUER_TESTNET;
  const passphrase =
    network === "stellar:pubnet" ? Networks.PUBLIC : Networks.TESTNET;
  const usdc = new Asset("USDC", usdcIssuer);

  const merchantAccount = await horizon.loadAccount(merchant.publicKey());
  const trustsUsdc = merchantAccount.balances.some(
    (b) =>
      "asset_code" in b &&
      b.asset_code === "USDC" &&
      b.asset_issuer === usdcIssuer,
  );
  if (trustsUsdc) {
    console.log("✓ Merchant already trusts USDC");
  } else {
    console.log("  Establishing merchant USDC trustline…");
    const tx = new TransactionBuilder(merchantAccount, {
      fee: BASE_FEE,
      networkPassphrase: passphrase,
    })
      .addOperation(Operation.changeTrust({ asset: usdc }))
      .setTimeout(60)
      .build();
    tx.sign(merchant);
    try {
      await horizon.submitTransaction(tx);
      console.log("  ✓ Merchant USDC trustline established");
    } catch (err) {
      console.error(
        `✗ Failed to establish merchant USDC trustline: ${describeHorizonError(err)}`,
      );
      process.exit(1);
    }
  }

  // Step 3 — persist remaining keys (idempotent merge).
  const envLines: string[] = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, "utf8").split("\n")
    : [];

  upsertEnv(envLines, "X402_MERCHANT_SECRET", merchantSecret);
  upsertEnv(envLines, "X402_MERCHANT_PUBKEY", merchant.publicKey());
  upsertEnv(envLines, "X402_DEMO_NETWORK", network);
  upsertEnv(
    envLines,
    "X402_FACILITATOR_URL",
    process.env.X402_FACILITATOR_URL ?? "https://www.x402.org/facilitator",
  );
  // Default: 0.001 USDC at 7 decimals → 10000 stroops.
  upsertEnv(
    envLines,
    "X402_DEMO_PRICE_ATOMIC",
    process.env.X402_DEMO_PRICE_ATOMIC ?? "10000",
  );

  writeFileSync(ENV_PATH, envLines.join("\n"));

  console.log("");
  console.log("✓ Done. .env updated with merchant config.");
  console.log(`  Network:    ${network}`);
  console.log(`  Merchant:   ${merchant.publicKey()}`);
  if (generated) {
    console.log("");
    console.log(
      "  Treat X402_MERCHANT_SECRET like a private key. Don't commit .env.",
    );
  }
}

async function accountExists(
  horizon: Horizon.Server,
  publicKey: string,
): Promise<boolean> {
  try {
    await horizon.loadAccount(publicKey);
    return true;
  } catch (err) {
    if (isHorizonNotFound(err)) return false;
    throw err;
  }
}

function isHorizonNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { response?: { status?: number }; name?: string };
  return e.response?.status === 404 || e.name === "NotFoundError";
}

function persistSecretEarly(secret: string, pubkey: string): void {
  const lines: string[] = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, "utf8").split("\n")
    : [];
  upsertEnv(lines, "X402_MERCHANT_SECRET", secret);
  upsertEnv(lines, "X402_MERCHANT_PUBKEY", pubkey);
  writeFileSync(ENV_PATH, lines.join("\n"));
}

function upsertEnv(lines: string[], key: string, value: string): void {
  const existing = lines.findIndex((l) => l.startsWith(`${key}=`));
  const newLine = `${key}=${value}`;
  if (existing >= 0) lines[existing] = newLine;
  else lines.push(newLine);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function describeHorizonError(err: unknown): string {
  const e = err as {
    response?: { data?: { extras?: { result_codes?: unknown } } };
    message?: string;
  };
  const codes = e?.response?.data?.extras?.result_codes;
  if (codes) return JSON.stringify(codes);
  return e?.message ?? String(err);
}

main().catch((err) => {
  console.error(
    "✗ x402-setup failed:",
    err instanceof Error ? (err.stack ?? err.message) : String(err),
  );
  process.exit(1);
});
