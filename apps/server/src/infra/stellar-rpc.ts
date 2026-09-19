import {
  Account,
  Horizon,
  rpc as sorobanRpc,
  Transaction,
  TransactionBuilder,
  type FeeBumpTransaction,
  type Networks,
  xdr,
} from "@stellar/stellar-sdk";
import type { StellarNetworkConfig } from "../config/index.js";

export type RpcErrorCode =
  | "RPC_TIMEOUT"
  | "RPC_UNAVAILABLE"
  | "RPC_BAD_RESPONSE"
  | "ACCOUNT_NOT_FOUND";

export class StellarRpcError extends Error {
  readonly code: RpcErrorCode;
  readonly cause?: unknown;

  constructor(code: RpcErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "StellarRpcError";
    this.code = code;
    this.cause = cause;
  }

  /**
   * Message that is safe to return to an API caller. `message` itself can
   * carry the raw transport error — including the upstream RPC URL, which
   * operators sometimes embed a provider token in — so anything that came
   * from the network layer is replaced. Log `message`/`cause` server-side.
   */
  get publicMessage(): string {
    switch (this.code) {
      case "RPC_TIMEOUT":
      case "ACCOUNT_NOT_FOUND":
        return this.message;
      case "RPC_BAD_RESPONSE":
        return "Stellar RPC returned an unexpected response";
      default:
        return "Stellar RPC is unavailable";
    }
  }
}

/**
 * Pairs the Horizon classic API with the Soroban RPC API behind one façade
 * the analyzer uses to read chain state. Adds a hard per-call timeout so a
 * stuck upstream fails fast instead of stalling an interactive sign flow —
 * deliberately no automatic retry-on-timeout here: that used to double the
 * worst case wait (timeout, then timeout again), and the caller already
 * has its own retry affordance (the popup's "Retry analysis" button) for
 * exactly this failure.
 */
export class StellarRpcAdapter {
  readonly network: StellarNetworkConfig["network"];
  readonly horizonUrl: string;
  readonly sorobanRpcUrl: string;
  readonly networkPassphrase: string;

  private readonly horizon: Horizon.Server;
  private readonly soroban: sorobanRpc.Server;
  private readonly timeoutMs: number;

  constructor(stellar: StellarNetworkConfig, timeoutMs: number) {
    this.network = stellar.network;
    this.horizonUrl = stellar.horizonUrl;
    this.sorobanRpcUrl = stellar.sorobanRpcUrl;
    this.networkPassphrase = stellar.networkPassphrase;
    this.timeoutMs = timeoutMs;

    this.horizon = new Horizon.Server(stellar.horizonUrl, {
      allowHttp: stellar.horizonUrl.startsWith("http://"),
    });
    this.soroban = new sorobanRpc.Server(stellar.sorobanRpcUrl, {
      allowHttp: stellar.sorobanRpcUrl.startsWith("http://"),
    });
  }

  /** Classic Horizon account (balances, signers, thresholds). Returns `null` for 404. */
  async loadAccount(
    accountId: string,
  ): Promise<Horizon.AccountResponse | null> {
    try {
      return await this.withTimeout(this.horizon.loadAccount(accountId));
    } catch (e) {
      if (isHorizonNotFound(e)) return null;
      throw mapRpcError(e);
    }
  }

  /**
   * Stellar's equivalent of `getMultipleAccountsInfo`. Drives both classic
   * balance-diff detection and Soroban-aware "did this account get touched?".
   */
  async loadAccountsBatch(
    accountIds: readonly string[],
  ): Promise<Array<Horizon.AccountResponse | null>> {
    return Promise.all(accountIds.map((id) => this.loadAccount(id)));
  }

  /**
   * Soroban preflight: simulates `InvokeHostFunction` / `ExtendFootprintTTL` /
   * `RestoreFootprint` ops. Returns the raw response so callers can inspect
   * resource fees, footprint, auth-entry diff, and host-fn result.
   */
  async simulateTransaction(
    tx: Transaction | FeeBumpTransaction,
  ): Promise<sorobanRpc.Api.SimulateTransactionResponse> {
    try {
      return await this.withTimeout(this.soroban.simulateTransaction(tx));
    } catch (e) {
      throw mapRpcError(e);
    }
  }

  /**
   * Resolve a Soroban contract's storage entry (e.g. SAC balances, swig
   * sub-key tables). Soroban-RPC's `getLedgerEntries` reads contract-owned
   * ledger state.
   */
  async getLedgerEntries(
    keys: readonly xdr.LedgerKey[],
  ): Promise<sorobanRpc.Api.GetLedgerEntriesResponse> {
    try {
      return await this.withTimeout(this.soroban.getLedgerEntries(...keys));
    } catch (e) {
      throw mapRpcError(e);
    }
  }

  /** Network info sanity check. backing for the `/ready` endpoint. */
  async pingRpc(): Promise<void> {
    try {
      const info = await this.withTimeout(this.soroban.getNetwork());
      if (info.passphrase !== this.networkPassphrase) {
        throw new StellarRpcError(
          "RPC_BAD_RESPONSE",
          `Soroban RPC passphrase mismatch: expected ${this.networkPassphrase}, got ${info.passphrase}`,
        );
      }
    } catch (e) {
      throw mapRpcError(e);
    }
  }

  /**
   * Builds a freshly-sequenced `TransactionBuilder` for the configured
   * network. used by `x402-setup` and demo paywall flows that need to
   * craft fund / trustline / payment ops on the server side.
   */
  async newTransactionBuilder(
    accountId: string,
    fee: string,
  ): Promise<TransactionBuilder> {
    const acct = await this.loadAccount(accountId);
    if (!acct) {
      throw new StellarRpcError(
        "ACCOUNT_NOT_FOUND",
        `Account ${accountId} not found on Horizon`,
      );
    }
    const source = new Account(acct.accountId(), acct.sequenceNumber());
    return new TransactionBuilder(source, {
      fee,
      networkPassphrase: this.networkPassphrase as Networks,
    });
  }

  /** Broadcasts a signed tx via Horizon. Used by `x402-setup` + demo merchant. */
  async submitTransaction(
    tx: Transaction | FeeBumpTransaction,
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    try {
      return await this.withTimeout(this.horizon.submitTransaction(tx));
    } catch (e) {
      throw mapRpcError(e);
    }
  }

  private async withTimeout<T>(p: PromiseLike<T>): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    try {
      return await Promise.race<T>([
        Promise.resolve(p),
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(
            () =>
              reject(
                new StellarRpcError("RPC_TIMEOUT", "RPC request timed out"),
              ),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

function isHorizonNotFound(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const anyE = e as { response?: { status?: number }; name?: string };
  return anyE.response?.status === 404 || anyE.name === "NotFoundError";
}

function mapRpcError(e: unknown): StellarRpcError {
  if (e instanceof StellarRpcError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new StellarRpcError("RPC_UNAVAILABLE", msg, e);
}
