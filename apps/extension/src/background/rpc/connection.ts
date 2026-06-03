/**
 * Pooled Stellar Horizon + Soroban RPC clients per network. Reused across
 * handlers, monitor, and reconciliation so we don't open redundant sockets.
 */

import { Horizon, Networks, rpc as sorobanRpc } from "@stellar/stellar-sdk";
import type { StellarNetwork } from "@stellar-thorn/ext-protocol";
import { getState } from "../state/store";

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

const horizonCache = new Map<StellarNetwork, Horizon.Server>();
const sorobanCache = new Map<StellarNetwork, sorobanRpc.Server>();

export function getHorizon(network?: StellarNetwork): Horizon.Server {
  const n: StellarNetwork = network ?? getState().network;
  let server = horizonCache.get(n);
  if (!server) {
    server = new Horizon.Server(HORIZON_ENDPOINTS[n]);
    horizonCache.set(n, server);
  }
  return server;
}

export function getSorobanServer(network?: StellarNetwork): sorobanRpc.Server {
  const n: StellarNetwork = network ?? getState().network;
  let server = sorobanCache.get(n);
  if (!server) {
    server = new sorobanRpc.Server(SOROBAN_RPC_ENDPOINTS[n]);
    sorobanCache.set(n, server);
  }
  return server;
}

export function getNetworkPassphrase(network?: StellarNetwork): string {
  const n: StellarNetwork = network ?? getState().network;
  return NETWORK_PASSPHRASES[n];
}

/** Soroban RPC URL string (for SDK helpers like `AssembledTransaction.build`). */
export function getSorobanRpcUrl(network?: StellarNetwork): string {
  const n: StellarNetwork = network ?? getState().network;
  return SOROBAN_RPC_ENDPOINTS[n];
}
