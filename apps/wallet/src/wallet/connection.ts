import { Connection, type Cluster as Web3Cluster, type Commitment } from "@solana/web3.js";
import type { Cluster } from "@stellar-thorn/swig-guard";

export const ACTIVE_CLUSTER: Cluster = "devnet";
export const RPC_URL = "https://api.devnet.solana.com";

let cached: Connection | null = null;

export function getConnection(commitment: Commitment = "confirmed"): Connection {
  if (cached) return cached;
  cached = new Connection(RPC_URL, { commitment });
  return cached;
}

export function explorerUrl(kind: "address" | "tx", value: string): string {
  const cluster = ACTIVE_CLUSTER === "mainnet-beta" ? "" : `?cluster=${ACTIVE_CLUSTER}`;
  return `https://explorer.solana.com/${kind}/${value}${cluster}`;
}

// Type assertion helper for callers that need the web3.js Cluster type
export const web3Cluster: Web3Cluster = ACTIVE_CLUSTER === "mainnet-beta" ? "mainnet-beta" : ACTIVE_CLUSTER;
