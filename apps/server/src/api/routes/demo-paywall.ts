/**
 * x402 demo paywall route — `/demo/scrybe?q=<question>`.
 *
 * Real x402 endpoint backed by a Built-on-Stellar facilitator (OpenZeppelin
 * Relayer or Coinbase CDP). Unauthenticated requests get HTTP 402 +
 * PaymentRequirements. Authenticated requests (PAYMENT-SIGNATURE header
 * populated by the Blackthorn extension) get the resource after on-chain
 * settlement.
 *
 * No mocking — settlement is a real Stellar testnet/pubnet transaction.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { FacilitatorClient } from "../../x402/facilitator-client.js";
import {
  loadMerchantConfig,
  MerchantConfigError,
} from "../../x402/merchant-config.js";

interface ScrybeQuery {
  q?: string;
}

const STOCK_ANSWERS: Record<string, string> = {
  soroban:
    "Soroban host functions are gas-metered and authorized via signed entries; preflight returns the projected resource fee before submit.",
  passkey:
    "Stellar Passkey wallets are smart-account contracts: WebAuthn signs an auth entry, sponsor pays the base + resource fee.",
  usdc:
    "Circle issues USDC on Stellar: classic asset USDC:GA5Z…KZVN (pubnet) / USDC:GBBD…LA5 (testnet); Soroban SAC CCW6… (pubnet) / CBIE… (testnet).",
  xlm: "XLM is the native asset on Stellar (7 decimals). Each tx pays a 100-stroop base fee per operation plus any Soroban resource fees.",
  x402:
    "x402 v2 is multi-chain (EVM, Solana, Stellar). On Stellar it uses Soroban auth-entry signing + a sponsored fee bump from the facilitator.",
};

function answerFor(q: string): string {
  const lower = q.toLowerCase();
  for (const [key, val] of Object.entries(STOCK_ANSWERS)) {
    if (lower.includes(key)) return val;
  }
  return `Echo (${q.length} chars): ${q.slice(0, 200)}`;
}

export function registerDemoPaywallRoute(app: FastifyInstance): void {
  let merchant: ReturnType<typeof loadMerchantConfig>;
  try {
    merchant = loadMerchantConfig();
  } catch (err) {
    if (err instanceof MerchantConfigError) {
      app.log.warn(`x402 demo paywall disabled: ${err.message}`);
      return;
    }
    throw err;
  }

  const facilitator = new FacilitatorClient({
    baseUrl: merchant.facilitatorUrl,
  });

  app.get<{ Querystring: ScrybeQuery }>("/demo/scrybe", async (req, reply) => {
    const q = (req.query.q ?? "").trim();
    if (!q) return reply.code(400).send({ error: "Missing ?q parameter" });
    if (q.length > 500)
      return reply
        .code(400)
        .send({ error: "Question too long (max 500 chars)" });

    const headerValue =
      pickHeader(req, "payment-signature") ?? pickHeader(req, "x-payment");
    const requirements = await buildRequirements(facilitator, merchant, q);

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
    });
  });

  app.log.info(
    `x402 demo paywall live: GET /demo/scrybe (merchant=${merchant.merchantPubkey.slice(0, 8)}…, network=${merchant.network})`,
  );
}

/* ────────────── Helpers ────────────── */

async function buildRequirements(
  facilitator: FacilitatorClient,
  merchant: ReturnType<typeof loadMerchantConfig>,
  q: string,
) {
  // Built-on-Stellar facilitators sponsor fees, so we still ask which signer
  // address the client should expect to fee-bump the inner tx — the value
  // ends up in `extra.sponsorBy` on the requirements.
  const sponsor = await facilitator
    .resolveFeePayer(merchant.network)
    .catch(() => null);
  if (!sponsor) {
    throw new Error(
      `Facilitator at ${merchant.facilitatorUrl} did not return a signer for ${merchant.network}`,
    );
  }

  return {
    scheme: "exact",
    network: merchant.network,
    asset: merchant.usdcContractAddress,
    amount: merchant.priceAtomic,
    payTo: merchant.merchantPubkey,
    maxTimeoutSeconds: 60,
    extra: {
      // x402 Stellar exact scheme: the facilitator sponsors the fee (wraps the
      // inner tx in a fee-bump). Clients require this flag to be true before
      // they build the auth-entry-signed payment. The facilitator's published
      // signer is surfaced as `sponsorBy` for transparency/diagnostics.
      areFeesSponsored: true,
      sponsorBy: sponsor,
      // No memo: the payment is a Soroban SAC transfer, and Stellar rejects
      // memos on Soroban transactions. Replay protection comes from the
      // Soroban auth-entry nonce, not a memo.
      description: `Scrybe answer for: ${q.slice(0, 80)}`,
      mimeType: "application/json",
    },
  };
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
  // Two-layer decode: base64 → JSON → payload.transaction itself is base64.
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
