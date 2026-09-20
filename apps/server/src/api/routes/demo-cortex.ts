/**
 * x402 demo paywall route for the "Cortex" showcase console.
 * `/demo/cortex?q=<question>&scenario=safe|drift|asset-swap|blind`.
 *
 * Same real facilitator-backed paywall as `/demo/scrybe` (no mocking —
 * settlement is a real Stellar testnet/pubnet transaction) but
 * parameterized by `scenario` so the showcase can demonstrate three
 * distinct, real x402 attack shapes against Baret's actual defenses:
 *
 *  - `drift`:      charges MORE per call than `safe` (still under a
 *                  typical per-tx cap on its own) so a rapid burst of real
 *                  calls trips the wallet's rolling hourly/daily cap —
 *                  "silent agent drift", caught by allowance bookkeeping.
 *  - `asset-swap`: same price, but `asset` is swapped to a real, deployed,
 *                  but DIFFERENT Soroban Asset Contract (the network's
 *                  native XLM SAC) instead of canonical USDC — a
 *                  look-alike-asset shape, caught by the wallet's asset
 *                  allow-list.
 *  - `blind`:      the REAL `PaymentRequirements.amount` returned here is
 *                  deliberately large (unlike `drift`, single-call,
 *                  comfortably over a typical per-tx cap). The server is
 *                  never dishonest — `accepted.amount` always matches what
 *                  actually gets signed and settled. The showcase page
 *                  itself, when this scenario is picked, is the one that
 *                  lies in its own display text, standing in for a
 *                  compromised/malicious frontend. Caught by Baret
 *                  decoding the real signed auth entry rather than
 *                  trusting the page.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Asset, Networks } from "@stellar/stellar-sdk";
import { FacilitatorClient } from "../../x402/facilitator-client.js";
import {
  loadMerchantConfig,
  MerchantConfigError,
  type MerchantConfig,
} from "../../x402/merchant-config.js";

type CortexScenario = "safe" | "drift" | "asset-swap" | "blind";

function normalizeScenario(raw: unknown): CortexScenario {
  return raw === "drift" || raw === "asset-swap" || raw === "blind" ? raw : "safe";
}

/** Per-call price override, atomic (7-decimal) units. `null` = use the merchant's normal price. */
const SCENARIO_PRICE_ATOMIC: Record<CortexScenario, string | null> = {
  safe: null,
  // 0.25 USDC/call — half the default 0.5 per-tx cap on its own, but the
  // ninth rapid call crosses the default 2.0/hour rolling cap (swig-guard's
  // DEFAULT_X402_CAPS). Costs about 2 testnet USDC per burst.
  drift: "2500000",
  "asset-swap": null,
  // 2.5 USDC — five times the default per-tx cap in a single call.
  blind: "25000000",
};

interface CortexQuery {
  q?: string;
  scenario?: string;
}

const STOCK_ANSWERS: Record<string, string> = {
  soroban:
    "Soroban host functions are gas-metered and authorized via signed entries; preflight returns the projected resource fee before submit.",
  cap: "Baret enforces per-tx, hourly, and daily spend caps per (merchant, asset) — a rolling window, not a fixed reset clock.",
  drift:
    "Agent drift is what happens when an autonomous payer keeps signing without a human noticing the total climbing. Caps bound the blast radius.",
  x402:
    "x402 on Stellar uses Soroban auth-entry signing + a sponsored fee bump from the facilitator.",
};

function answerFor(q: string): string {
  const lower = q.toLowerCase();
  for (const [key, val] of Object.entries(STOCK_ANSWERS)) {
    if (lower.includes(key)) return val;
  }
  return `Echo (${q.length} chars): ${q.slice(0, 200)}`;
}

export function registerDemoCortexRoute(app: FastifyInstance): void {
  let merchant: MerchantConfig;
  try {
    merchant = loadMerchantConfig();
  } catch (err) {
    if (err instanceof MerchantConfigError) {
      app.log.warn(`x402 Cortex demo disabled: ${err.message}`);
      return;
    }
    throw err;
  }

  const facilitator = new FacilitatorClient({ baseUrl: merchant.facilitatorUrl });

  app.get<{ Querystring: CortexQuery }>("/demo/cortex", async (req, reply) => {
    const q = (req.query.q ?? "").trim();
    if (!q) return reply.code(400).send({ error: "Missing ?q parameter" });
    if (q.length > 500)
      return reply.code(400).send({ error: "Question too long (max 500 chars)" });
    const scenario = normalizeScenario(req.query.scenario);

    const headerValue =
      pickHeader(req, "payment-signature") ?? pickHeader(req, "x-payment");
    let requirements: Awaited<ReturnType<typeof buildRequirements>>;
    try {
      requirements = await buildRequirements(facilitator, merchant, q, scenario);
    } catch (err) {
      // The message names the facilitator URL, so it stays in the log.
      req.log.warn({ err }, "cortex: couldn't build payment requirements");
      return reply.code(502).send({ error: "Couldn't build payment requirements" });
    }

    if (!headerValue) {
      return send402(reply, requirements);
    }

    let payload: ReturnType<typeof decodePaymentPayload>;
    try {
      payload = decodePaymentPayload(headerValue);
    } catch (err) {
      return reply.code(400).send({
        error: "Malformed PAYMENT-SIGNATURE header",
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    const verifyRes = await facilitator
      .verify(payload, requirements)
      .catch((err) => ({
        isValid: false as const,
        invalidReason: err instanceof Error ? err.message : String(err),
      }));
    if (!verifyRes.isValid) {
      reply.code(402);
      reply.header(
        "PAYMENT-REQUIRED",
        base64(
          JSON.stringify({
            x402Version: 2,
            accepts: [requirements],
            error: verifyRes.invalidReason ?? "verification_failed",
          }),
        ),
      );
      return reply.send({
        x402Version: 2,
        accepts: [requirements],
        error: "Payment verification failed",
        detail: verifyRes.invalidReason,
      });
    }

    const settleRes = await facilitator
      .settle(payload, requirements)
      .catch((err) => ({
        success: false as const,
        errorReason: err instanceof Error ? err.message : String(err),
      }));
    if (!settleRes.success) {
      return reply.code(502).send({
        error: "Settlement failed at facilitator",
        detail: settleRes.errorReason,
      });
    }

    reply.header(
      "PAYMENT-RESPONSE",
      base64(
        JSON.stringify({
          success: true,
          transaction: settleRes.transaction,
          network: settleRes.network ?? requirements.network,
          payer: settleRes.payer,
        }),
      ),
    );
    return reply.send({
      answer: answerFor(q),
      paid: true,
      settlement: settleRes.transaction,
      payer: settleRes.payer,
      scenario,
    });
  });

  app.log.info(
    `x402 Cortex demo live: GET /demo/cortex (merchant=${merchant.merchantPubkey.slice(0, 8)}…, network=${merchant.network})`,
  );
}

/* ────────────── Helpers ────────────── */

async function buildRequirements(
  facilitator: FacilitatorClient,
  merchant: MerchantConfig,
  q: string,
  scenario: CortexScenario,
) {
  const sponsor = await facilitator
    .resolveFeePayer(merchant.network)
    .catch(() => null);
  if (!sponsor) {
    throw new Error(
      `Facilitator at ${merchant.facilitatorUrl} did not return a signer for ${merchant.network}`,
    );
  }

  const amount = SCENARIO_PRICE_ATOMIC[scenario] ?? merchant.priceAtomic;
  const asset =
    scenario === "asset-swap"
      ? nativeXlmContractId(merchant.network)
      : merchant.usdcContractAddress;

  return {
    scheme: "exact",
    network: merchant.network,
    asset,
    amount,
    payTo: merchant.merchantPubkey,
    maxTimeoutSeconds: 60,
    extra: {
      areFeesSponsored: true,
      sponsorBy: sponsor,
      description:
        scenario === "safe"
          ? `Cortex answer for: ${q.slice(0, 80)}`
          : `Cortex (${scenario}) answer for: ${q.slice(0, 80)}`,
      mimeType: "application/json",
      scenario,
    },
  };
}

/** The network's real, protocol-deployed native-XLM Soroban Asset Contract — a genuine, signable/settleable token, just not the canonical USDC the merchant normally charges in. */
function nativeXlmContractId(network: MerchantConfig["network"]): string {
  const passphrase = network === "stellar:pubnet" ? Networks.PUBLIC : Networks.TESTNET;
  return Asset.native().contractId(passphrase);
}

function send402(
  reply: FastifyReply,
  requirements: ReturnType<typeof buildRequirements> extends Promise<infer U>
    ? U
    : never,
) {
  reply.code(402);
  reply.header(
    "PAYMENT-REQUIRED",
    base64(JSON.stringify({ x402Version: 2, accepts: [requirements] })),
  );
  return reply.send({
    x402Version: 2,
    accepts: [requirements],
    error: "Payment required",
  });
}

function decodePaymentPayload(headerValue: string) {
  const json = JSON.parse(Buffer.from(headerValue, "base64").toString("utf8"));
  if (!json || typeof json !== "object")
    throw new Error("payload is not an object");
  if (!json.payload || typeof json.payload.transaction !== "string") {
    throw new Error("payload.transaction missing");
  }
  if (!json.accepted || typeof json.accepted !== "object") {
    throw new Error("accepted requirements missing");
  }
  return json as {
    x402Version: 1 | 2;
    resource?: { url: string };
    accepted: Awaited<ReturnType<typeof buildRequirements>>;
    payload: { transaction: string };
  };
}

function pickHeader(req: FastifyRequest, name: string): string | null {
  const v = req.headers[name];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function base64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}
