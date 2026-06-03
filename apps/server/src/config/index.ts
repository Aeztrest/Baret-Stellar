import { Networks, StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

const networkSchema = z.enum(["testnet", "pubnet"]);

const authModeSchema = z.enum(["api_key", "x402", "both"]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  DELTAG_API_KEYS: z.string().optional(),
  DELTAG_AUTH_MODE: authModeSchema.optional(),

  STELLAR_NETWORK: networkSchema.default("testnet"),
  STELLAR_HORIZON_URL: z.string().url(),
  STELLAR_SOROBAN_RPC_URL: z.string().url(),
  STELLAR_USDC_ISSUER: z.string().optional(),
  STELLAR_USDC_CODE: z.string().default("USDC"),

  RISKY_CONTRACT_IDS: z.string().optional(),
  KNOWN_SAFE_CONTRACT_IDS: z.string().optional(),

  MAX_SIMULATION_OPERATIONS: z.coerce.number().int().positive().max(100).default(20),
  MAX_BODY_BYTES: z.coerce.number().int().positive().default(1_048_576),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
  DELTAG_RATE_LIMIT_MAX: z.coerce.number().int().nonnegative().default(200),
  DELTAG_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  /** 1/true: X-Forwarded-For ile gerçek istemci IP (reverse proxy / Docker arkası) */
  DELTAG_TRUST_PROXY: z.string().optional(),

  X402_ENABLED: z.string().optional(),
  X402_FACILITATOR_URL: z.string().url().optional(),
  X402_PAY_TO: z.string().optional(),
  X402_NETWORK: z.string().optional(),
  X402_ANALYZE_PRICE: z.string().optional(),
});

export type StellarNetwork = z.infer<typeof networkSchema>;
export type AuthMode = z.infer<typeof authModeSchema>;

export type X402Config = {
  enabled: boolean;
  facilitatorUrl: string;
  payTo: string;
  network: string;
  analyzePrice: string;
};

export type StellarNetworkConfig = {
  network: StellarNetwork;
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
  /** Friendbot exists only on testnet. */
  friendbotUrl: string | null;
  /** Classic USDC issuer (`G…`) for tx whose ops reference the asset by code+issuer. */
  usdcIssuer: string;
  /** Classic USDC asset code (almost always `"USDC"`). */
  usdcCode: string;
  /** Soroban USDC SAC contract address (`C…`) — what x402 transfers reference. */
  usdcContractAddress: string;
};

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  logLevel: z.infer<typeof envSchema>["LOG_LEVEL"];
  apiKeys: string[];
  authMode: AuthMode;
  x402: X402Config;
  stellar: StellarNetworkConfig;
  riskyContractIds: Set<string>;
  knownSafeContractIds: Set<string>;
  maxSimulationOperations: number;
  maxBodyBytes: number;
  requestTimeoutMs: number;
  /** 0 = rate limiting disabled */
  rateLimitMax: number;
  rateLimitWindowMs: number;
  /** Reverse proxy arkasında doğru istemci IP ve rate limit için */
  trustProxy: boolean;
};

// Circle USDC, classic Stellar asset issuers (G…).
const USDC_ISSUER_PUBNET =
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const USDC_ISSUER_TESTNET =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

// Stellar Asset Contract (SAC) addresses — what @x402/stellar transfers reference.
const USDC_CONTRACT_PUBNET =
  "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const USDC_CONTRACT_TESTNET =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

const FRIENDBOT_URL = "https://friendbot.stellar.org";

function defaultUsdcIssuerFor(network: StellarNetwork): string {
  return network === "pubnet" ? USDC_ISSUER_PUBNET : USDC_ISSUER_TESTNET;
}

function usdcContractFor(network: StellarNetwork): string {
  return network === "pubnet" ? USDC_CONTRACT_PUBNET : USDC_CONTRACT_TESTNET;
}

function passphraseFor(network: StellarNetwork): string {
  return network === "pubnet" ? Networks.PUBLIC : Networks.TESTNET;
}

function friendbotFor(network: StellarNetwork): string | null {
  return network === "testnet" ? FRIENDBOT_URL : null;
}

function splitIds(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function isValidStellarAddress(address: string): boolean {
  return (
    StrKey.isValidEd25519PublicKey(address) || StrKey.isValidContract(address)
  );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    throw new Error(
      `Invalid environment configuration: ${JSON.stringify(msg)}`,
    );
  }
  const e = parsed.data;
  const apiKeys =
    e.DELTAG_API_KEYS?.split(",")
      .map((k) => k.trim())
      .filter(Boolean) ?? [];

  const x402Raw = (e.X402_ENABLED ?? "").trim().toLowerCase();
  const x402Enabled =
    x402Raw === "1" || x402Raw === "true" || x402Raw === "yes";
  const payTo = e.X402_PAY_TO?.trim() ?? "";
  if (x402Enabled) {
    if (!payTo) {
      throw new Error("X402_PAY_TO is required when X402_ENABLED=true");
    }
    if (!isValidStellarAddress(payTo)) {
      throw new Error(`X402_PAY_TO is not a valid Stellar address: ${payTo}`);
    }
  }

  let authMode: AuthMode = e.DELTAG_AUTH_MODE ?? "api_key";
  if (x402Enabled && !e.DELTAG_AUTH_MODE) {
    authMode = apiKeys.length > 0 ? "both" : "x402";
  }
  if (!x402Enabled && authMode !== "api_key") {
    authMode = "api_key";
  }

  const trustProxyRaw = (e.DELTAG_TRUST_PROXY ?? "").trim().toLowerCase();
  const trustProxy =
    trustProxyRaw === "1" ||
    trustProxyRaw === "true" ||
    trustProxyRaw === "yes";

  const network = e.STELLAR_NETWORK;
  const stellar: StellarNetworkConfig = {
    network,
    horizonUrl: e.STELLAR_HORIZON_URL,
    sorobanRpcUrl: e.STELLAR_SOROBAN_RPC_URL,
    networkPassphrase: passphraseFor(network),
    friendbotUrl: friendbotFor(network),
    usdcIssuer: e.STELLAR_USDC_ISSUER?.trim() || defaultUsdcIssuerFor(network),
    usdcCode: e.STELLAR_USDC_CODE,
    usdcContractAddress: usdcContractFor(network),
  };

  const x402: X402Config = {
    enabled: x402Enabled,
    facilitatorUrl: e.X402_FACILITATOR_URL ?? "https://www.x402.org/facilitator",
    payTo,
    network: e.X402_NETWORK?.trim() || `stellar:${network}`,
    analyzePrice: e.X402_ANALYZE_PRICE?.trim() || "$0.001",
  };

  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    apiKeys,
    authMode,
    x402,
    stellar,
    riskyContractIds: splitIds(e.RISKY_CONTRACT_IDS),
    knownSafeContractIds: splitIds(e.KNOWN_SAFE_CONTRACT_IDS),
    maxSimulationOperations: e.MAX_SIMULATION_OPERATIONS,
    maxBodyBytes: e.MAX_BODY_BYTES,
    requestTimeoutMs: e.REQUEST_TIMEOUT_MS,
    rateLimitMax: e.DELTAG_RATE_LIMIT_MAX,
    rateLimitWindowMs: e.DELTAG_RATE_LIMIT_WINDOW_MS,
    trustProxy,
  };
}

export { networkSchema };
