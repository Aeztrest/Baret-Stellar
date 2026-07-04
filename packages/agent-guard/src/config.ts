/**
 * Configuration resolution for agent-guard.
 *
 * Agents are headless, so config is layered (highest priority first):
 *   1. Explicit options passed in code / CLI flags
 *   2. Environment variables (BARET_*)
 *   3. The on-disk config file (~/.baret/config.json. written by `baret init`)
 *   4. Built-in defaults
 *
 * The agent secret (S…) is ONLY ever read from an explicit option or the
 * BARET_AGENT_SECRET env var. never the config file. so a leaked config file
 * can't sign anything.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import {
  POLICY_TEMPLATES,
  BALANCED_POLICY,
  validatePolicy,
  type GuardPolicy,
  type PolicyTemplateId,
  type StellarNetwork,
} from "@stellar-thorn/swig-guard";

/** Public Horizon endpoints per network (mirrors apps/wallet + apps/extension). */
export const HORIZON_ENDPOINTS: Record<StellarNetwork, string> = {
  testnet: "https://horizon-testnet.stellar.org",
  pubnet: "https://horizon.stellar.org",
};

export const DEFAULT_SERVER_URL = "http://localhost:8080";
export const DEFAULT_NETWORK: StellarNetwork = "testnet";

/** Raw, unresolved config. every field optional, any layer may supply it. */
export interface RawConfig {
  /** Base URL of the Baret analyze server. */
  serverUrl?: string;
  /** Bearer API key for the Baret server (when DELTAG_API_KEYS is set). */
  apiKey?: string;
  /** Stellar network the agent operates on. */
  network?: StellarNetwork;
  /** Policy: a template id, a GuardPolicy object, or a JSON string of one. */
  policy?: PolicyTemplateId | GuardPolicy | string;
  /** Agent ed25519 secret seed (S…). Required only for sign/submit. */
  agentSecret?: string;
  /** Override the Horizon endpoint (defaults to the network's public one). */
  horizonUrl?: string;
}

/** Fully resolved, ready-to-use config. */
export interface ResolvedConfig {
  serverUrl: string;
  apiKey?: string;
  network: StellarNetwork;
  policy: GuardPolicy;
  agentSecret?: string;
  horizonUrl: string;
}

/** Fields persisted to ~/.baret/config.json. Never includes the secret. */
export interface PersistedConfig {
  serverUrl?: string;
  apiKey?: string;
  network?: StellarNetwork;
  /** Stored as a template id or an inline policy object. */
  policy?: PolicyTemplateId | GuardPolicy;
  horizonUrl?: string;
}

export const CONFIG_DIR = join(homedir(), ".baret");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

function isNetwork(v: unknown): v is StellarNetwork {
  return v === "testnet" || v === "pubnet";
}

/** Read ~/.baret/config.json, or null if it doesn't exist / is unreadable. */
export function readConfigFile(path = CONFIG_PATH): PersistedConfig | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as PersistedConfig;
  } catch {
    return null;
  }
}

/** Write ~/.baret/config.json (creating the directory). Secret is never stored. */
export function writeConfigFile(cfg: PersistedConfig, path = CONFIG_PATH): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

/** Read the BARET_* env layer into a RawConfig. */
function envConfig(env: NodeJS.ProcessEnv = process.env): RawConfig {
  const out: RawConfig = {};
  if (env.BARET_API_URL) out.serverUrl = env.BARET_API_URL;
  if (env.BARET_API_KEY) out.apiKey = env.BARET_API_KEY;
  if (isNetwork(env.BARET_NETWORK)) out.network = env.BARET_NETWORK;
  if (env.BARET_POLICY) out.policy = env.BARET_POLICY;
  if (env.BARET_AGENT_SECRET) out.agentSecret = env.BARET_AGENT_SECRET;
  if (env.BARET_HORIZON_URL) out.horizonUrl = env.BARET_HORIZON_URL;
  return out;
}

/** Horizon URL for a network, honoring an explicit override. */
export function resolveHorizonUrl(
  network: StellarNetwork,
  override?: string,
): string {
  return override?.trim() || HORIZON_ENDPOINTS[network];
}

/**
 * Turn a template id / object / JSON string into a validated GuardPolicy.
 * Throws on an unknown template id or an invalid policy object.
 */
export function resolvePolicy(
  input: PolicyTemplateId | GuardPolicy | string | undefined,
): GuardPolicy {
  if (input === undefined) return BALANCED_POLICY;

  if (typeof input === "object") {
    validatePolicy(input);
    return input;
  }

  // String: either a known template id or a JSON-encoded policy.
  const template = POLICY_TEMPLATES.find((t) => t.id === input);
  if (template) return template.policy;

  if (input === "custom") return BALANCED_POLICY;

  const trimmed = input.trim();
  if (trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`Invalid policy JSON: ${trimmed.slice(0, 60)}…`);
    }
    validatePolicy(parsed as GuardPolicy);
    return parsed as GuardPolicy;
  }

  throw new Error(
    `Unknown policy "${input}". Use a template id (${POLICY_TEMPLATES.map(
      (t) => t.id,
    ).join(", ")}) or a JSON policy object.`,
  );
}

/**
 * Merge all config layers into a ready-to-use ResolvedConfig.
 * Precedence: explicit > env > file > defaults.
 */
export function loadConfig(
  explicit: RawConfig = {},
  opts: { env?: NodeJS.ProcessEnv; configPath?: string } = {},
): ResolvedConfig {
  const file = readConfigFile(opts.configPath) ?? {};
  const env = envConfig(opts.env);

  const pick = <K extends keyof RawConfig>(key: K): RawConfig[K] =>
    explicit[key] ?? env[key] ?? (file as RawConfig)[key];

  const network = (pick("network") as StellarNetwork) ?? DEFAULT_NETWORK;
  const policy = resolvePolicy(pick("policy"));

  return {
    serverUrl: (pick("serverUrl") as string) ?? DEFAULT_SERVER_URL,
    apiKey: pick("apiKey") as string | undefined,
    network,
    policy,
    // Secret is intentionally only sourced from explicit/env (never the file).
    agentSecret: explicit.agentSecret ?? env.agentSecret,
    horizonUrl: resolveHorizonUrl(network, pick("horizonUrl") as string),
  };
}
