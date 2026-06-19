/**
 * Stellar Horizon + Soroban RPC clients for the wallet (testnet build).
 * The wallet talks to a single network; production deployments can switch
 * ACTIVE_NETWORK to "pubnet".
 */

import { Horizon, Networks, rpc as sorobanRpc } from "@stellar/stellar-sdk";
import type { StellarNetwork } from "@stellar-thorn/swig-guard";

export const ACTIVE_NETWORK: StellarNetwork = "testnet";

const HORIZON_ENDPOINTS: Record<StellarNetwork, string> = {
  testnet: "https://horizon-testnet.stellar.org",
  pubnet: "https://horizon.stellar.org",
};

const SOROBAN_RPC_ENDPOINTS: Record<StellarNetwork, string> = {
  testnet: "https://soroban-testnet.stellar.org",
  pubnet: "https://soroban-rpc.creit.tech",
};

const NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  testnet: Networks.TESTNET,
  pubnet: Networks.PUBLIC,
};

export const RPC_URL = HORIZON_ENDPOINTS[ACTIVE_NETWORK];

let horizon: Horizon.Server | null = null;
let soroban: sorobanRpc.Server | null = null;

export function getHorizon(): Horizon.Server {
  if (!horizon) horizon = new Horizon.Server(HORIZON_ENDPOINTS[ACTIVE_NETWORK]);
  return horizon;
}

export function getSorobanServer(): sorobanRpc.Server {
  if (!soroban) soroban = new sorobanRpc.Server(SOROBAN_RPC_ENDPOINTS[ACTIVE_NETWORK]);
  return soroban;
}

export function getNetworkPassphrase(): string {
  return NETWORK_PASSPHRASES[ACTIVE_NETWORK];
}

/** stellar.expert deep link for an account or transaction. */
export function explorerUrl(kind: "account" | "address" | "tx", value: string): string {
  const seg = kind === "tx" ? "tx" : "account";
  const net = ACTIVE_NETWORK === "pubnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}/${seg}/${value}`;
}

/**
 * Fund an account with testnet XLM via Friendbot. Pubnet has no faucet, so this
 * resolves to a no-op signal there. Returns the funding tx hash when available.
 */
export async function friendbotFund(address: string): Promise<{ hash: string | null }> {
  if (ACTIVE_NETWORK !== "testnet") {
    throw new Error("Friendbot funding is only available on testnet.");
  }
  const res = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { detail?: string };
      detail = body.detail ?? "";
    } catch {
      /* ignore */
    }
    // Already-funded accounts return 400 — treat as success so the flow continues.
    if (res.status === 400 && /already funded|op_already_exists/i.test(detail)) {
      return { hash: null };
    }
    throw new Error(`Friendbot funding failed (HTTP ${res.status}). ${detail}`.trim());
  }
  const body = (await res.json().catch(() => ({}))) as { hash?: string };
  return { hash: body.hash ?? null };
}
