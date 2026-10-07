/**
 * On-chain spending limits for an agent: a passkey-kit smart wallet that
 * holds the funds, `MerchantSpendPolicy` (contracts/contracts/merchant-spend-policy)
 * as the cap enforcer, and the agent's own Ed25519 key registered on the
 * wallet as a sub-key that can only `transfer` one token to one merchant,
 * within that merchant's per-transaction and rolling 24h caps.
 *
 * Same on-chain shape the extension provisions (apps/extension/src/background/swig/),
 * with the owner and the agent split into two processes: the owner runs
 * `SpendPolicyOwner` once to set the limits, the agent runs `payMerchant`
 * with only its own key. The owner's key is never needed at payment time,
 * and the agent's key can't raise its own caps (set_allowance, pause,
 * resume and revoke all require the wallet's admin signer).
 *
 * Exported as the `./spend-policy` subpath, not from the package root:
 * passkey-kit depends on `sac-sdk`, which ships raw TypeScript that plain
 * Node can't load. Keeping it off the root keeps the `baret` CLI and the
 * AgentWallet SDK runnable under plain Node; this module runs under tsx or
 * a bundler until the package is bundled for npm.
 */

import {
  Address,
  Contract,
  Keypair,
  Networks,
  StrKey,
  TransactionBuilder,
  hash,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { Client as SorobanClient, type AssembledTransaction } from "@stellar/stellar-sdk/contract";
import {
  Ed25519Signer,
  PasskeyClient,
  PasskeyKit,
  SignerKey,
  SignerStore,
  deriveContractAddress,
} from "passkey-kit";
import type { Signer as WalletSigner } from "passkey-kit-sdk";
import type { StellarNetwork } from "@stellar-thorn/swig-guard";

/**
 * passkey-kit's canonical smart-wallet WASM. The same hash is installed on
 * testnet and mainnet (checked against both networks' RPC on 2026-10-02);
 * mirrors apps/extension/src/background/swig/smart-wallet-config.ts.
 */
export const SMART_WALLET_WASM_HASH =
  "fdefad64b96837147e1c333e51f537b696eab925e9f147e63d597c04e3c903f0";

export const SOROBAN_RPC_ENDPOINTS: Record<StellarNetwork, string> = {
  testnet: "https://soroban-testnet.stellar.org",
  // SDF runs no public mainnet RPC; this is one of the free providers listed
  // at developers.stellar.org/docs/data/rpc/rpc-providers. Override it for
  // anything beyond a proof run.
  pubnet: "https://mainnet.sorobanrpc.com",
};

const NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  testnet: Networks.TESTNET,
  pubnet: Networks.PUBLIC,
};

// Mainnet's Soroban lane had a queue when this was written: at the SDK's
// default bid (100 stroops) and a 30 s validity window a wallet deploy was
// accepted and then expired without ever entering a ledger (the median
// inclusion fee was 200). The network charges the lane's clearing rate, not
// the bid, so a generous bid costs nothing extra in quiet ledgers.
const TX_TIMEOUT_SECONDS = 120;
const INCLUSION_FEE_STROOPS = "10000";
/** Poll past the validity window, so NOT_FOUND means "expired", not "still pending". */
const POLL_ATTEMPTS = TX_TIMEOUT_SECONDS + 15;

/**
 * Most a transaction may bid above its Soroban resource fee (0.1 XLM, in
 * stroops). `submitBuilt` refuses anything higher: the SDK's
 * `AssembledTransaction.sign()` rebuilds the transaction and adds the
 * resource fee to the bid a second time, which on mainnet turned a 51 XLM
 * wallet deploy into a 103 XLM bid (rejected as txInsufficientBalance, and
 * a 51 XLM inclusion bid had it been accepted).
 */
const MAX_INCLUSION_BID_STROOPS = 1_000_000n;

export interface SpendPolicyNetworkOptions {
  network: StellarNetwork;
  /** Deployed MerchantSpendPolicy contract (`C…`) on that network. */
  policyContractId: string;
  /** Defaults to SOROBAN_RPC_ENDPOINTS[network]. */
  rpcUrl?: string;
  /**
   * Build and simulate, report each transaction's fee through `onFee`, send
   * nothing. Steps that need an earlier step on chain can only be dry-run
   * once that step has really been sent.
   */
  dryRun?: boolean;
  /** Called with every transaction's label and fee bid before it is sent (or skipped, in a dry run). */
  onFee?: (info: { label: string; feeXlm: string; resourceFeeXlm: string }) => void;
}

export interface MerchantGrant {
  /** Who the agent may pay (`G…` or `C…`). */
  merchant: string;
  /** The agent's Ed25519 public key (`G…`); becomes the wallet sub-key. */
  agentPublicKey: string;
  /** SEP-41 token (`C…`, e.g. the USDC SAC) the sub-key is scoped to. */
  token: string;
  /** Atomic units (7 decimals for SAC assets). */
  capPerTx: bigint;
  /** Atomic units, rolling 24h window. */
  capPerDay: bigint;
  /** How long the grant lives; renewing needs the owner again. */
  mandateSeconds: number;
}

export type AllowanceStatus = "Active" | "Paused" | "Revoked";

export interface AllowanceView {
  signer: string;
  capPerTx: bigint;
  capPerDay: bigint;
  status: AllowanceStatus;
  expiresAt: number;
  availableToday: bigint;
}

/** Hand-typed against lib.rs; `Client.from` checks it against the on-chain spec. */
interface PolicyClient {
  set_allowance(args: {
    wallet: string;
    merchant: string;
    signer: Buffer;
    cap_per_tx: bigint;
    cap_per_day: bigint;
    mandate_seconds: bigint;
  }): Promise<AssembledTransaction<null>>;
  pause(args: { wallet: string; merchant: string }): Promise<AssembledTransaction<null>>;
  resume(args: { wallet: string; merchant: string }): Promise<AssembledTransaction<null>>;
  revoke(args: { wallet: string; merchant: string }): Promise<AssembledTransaction<null>>;
  get_allowance(args: { wallet: string; merchant: string }): Promise<
    AssembledTransaction<{
      signer: Buffer;
      cap_per_tx: bigint;
      cap_per_day: bigint;
      status: { tag: AllowanceStatus } | number;
      expires_at: bigint;
    }>
  >;
  available_today(args: { wallet: string; merchant: string }): Promise<AssembledTransaction<bigint>>;
}

const STATUS_BY_INDEX: AllowanceStatus[] = ["Active", "Paused", "Revoked"];

/**
 * The wallet owner's side: deploy the smart wallet, install the policy and
 * grant / pause / resume / revoke a merchant. Every call is signed by
 * `owner`, which is both the fee payer and the wallet's admin signer.
 */
export class SpendPolicyOwner {
  readonly network: StellarNetwork;
  readonly networkPassphrase: string;
  readonly rpcUrl: string;
  readonly policyContractId: string;
  /** Deterministic: the same owner key always maps to the same wallet. */
  readonly walletAddress: string;
  private readonly server: rpc.Server;
  private readonly dryRun: boolean;
  private readonly onFee: SpendPolicyNetworkOptions["onFee"];

  constructor(
    private readonly owner: Keypair,
    opts: SpendPolicyNetworkOptions,
  ) {
    assertContract(opts.policyContractId, "policyContractId");
    this.network = opts.network;
    this.networkPassphrase = NETWORK_PASSPHRASES[opts.network];
    this.rpcUrl = opts.rpcUrl ?? SOROBAN_RPC_ENDPOINTS[opts.network];
    this.policyContractId = opts.policyContractId;
    this.server = new rpc.Server(this.rpcUrl);
    this.dryRun = opts.dryRun ?? false;
    this.onFee = opts.onFee;
    this.walletAddress = deriveContractAddress(
      Buffer.from(owner.rawPublicKey()),
      owner.publicKey(),
      this.networkPassphrase,
    );
  }

  /** Deploys the wallet with `owner` as its only admin signer. No-op if it exists. */
  async ensureWallet(): Promise<{ walletAddress: string; txHash?: string }> {
    if (await this.contractExists(this.walletAddress)) {
      return { walletAddress: this.walletAddress };
    }

    const signer: WalletSigner = {
      tag: "Ed25519",
      values: [
        this.owner.rawPublicKey(),
        [undefined], // never expires
        [undefined], // unlimited: this is the admin key
        { tag: "Persistent", values: undefined },
      ],
    };
    // Same salt rule as the extension (hash of the admin key), which is what
    // makes `walletAddress` derivable before the deploy.
    const at = await PasskeyClient.deploy(
      { signer },
      {
        rpcUrl: this.rpcUrl,
        wasmHash: SMART_WALLET_WASM_HASH,
        networkPassphrase: this.networkPassphrase,
        publicKey: this.owner.publicKey(),
        salt: hash(this.owner.rawPublicKey()),
        timeoutInSeconds: TX_TIMEOUT_SECONDS,
      },
    );
    if (at.result.options.contractId !== this.walletAddress) {
      throw new Error(
        `Smart-wallet address mismatch: deploy returned ${at.result.options.contractId}, expected ${this.walletAddress}`,
      );
    }
    const txHash = await this.submitBuilt(at.built, "smart-wallet deploy");
    return { walletAddress: this.walletAddress, txHash };
  }

  /**
   * Registers the policy as a wallet signer, which fires its `install` hook.
   * Empty limits map on purpose: the policy must never authorize anything on
   * its own, only co-sign for a sub-key that names it (see
   * apps/extension/src/background/swig/sub-keys.ts#ensurePolicyInstalled).
   */
  async ensurePolicyInstalled(): Promise<{ txHash?: string }> {
    const kit = this.kit();
    if (await kit.getSigner(SignerKey.Policy(this.policyContractId))) return {};
    const tx = await kit.addPolicy(this.policyContractId, new Map(), SignerStore.Persistent);
    return { txHash: await this.signAndSend(kit, tx, "policy install") };
  }

  /**
   * Grants the merchant's caps bound to the agent key, then registers that key
   * as a wallet signer scoped to `token` and gated by the policy. The
   * allowance goes first so the key is never live without a cap behind it.
   */
  async grantMerchant(grant: MerchantGrant): Promise<{ allowanceTxHash: string; signerTxHash: string }> {
    if (!StrKey.isValidEd25519PublicKey(grant.agentPublicKey)) {
      throw new Error("agentPublicKey must be a G… address");
    }
    assertContract(grant.token, "token");
    if (grant.capPerTx <= 0n || grant.capPerDay <= 0n) throw new Error("caps must be positive");
    if (grant.capPerTx > grant.capPerDay) throw new Error("capPerTx cannot exceed capPerDay");
    if (!Number.isInteger(grant.mandateSeconds) || grant.mandateSeconds <= 0) {
      throw new Error("mandateSeconds must be a positive integer");
    }

    const kit = this.kit();
    const policy = await this.policyClient();
    const allowanceTx = await policy.set_allowance({
      wallet: this.walletAddress,
      merchant: grant.merchant,
      signer: Keypair.fromPublicKey(grant.agentPublicKey).rawPublicKey(),
      cap_per_tx: grant.capPerTx,
      cap_per_day: grant.capPerDay,
      mandate_seconds: BigInt(grant.mandateSeconds),
    });
    const allowanceTxHash = await this.signAndSend(kit, allowanceTx, "set_allowance");

    // The signer entry expires with the mandate, so a lapsed key doesn't
    // linger on the wallet.
    const expiresAt = Math.floor(Date.now() / 1000) + grant.mandateSeconds;
    const limits = new Map([[grant.token, [SignerKey.Policy(this.policyContractId)]]]);
    const signerTx = await kit.addEd25519(grant.agentPublicKey, limits, SignerStore.Temporary, expiresAt);
    const signerTxHash = await this.signAndSend(kit, signerTx, "add_signer (agent key)");

    return { allowanceTxHash, signerTxHash };
  }

  async pause(merchant: string): Promise<string> {
    const tx = await (await this.policyClient()).pause({ wallet: this.walletAddress, merchant });
    return this.signAndSend(this.kit(), tx, "pause");
  }

  async resume(merchant: string): Promise<string> {
    const tx = await (await this.policyClient()).resume({ wallet: this.walletAddress, merchant });
    return this.signAndSend(this.kit(), tx, "resume");
  }

  async revoke(merchant: string): Promise<string> {
    const tx = await (await this.policyClient()).revoke({ wallet: this.walletAddress, merchant });
    return this.signAndSend(this.kit(), tx, "revoke");
  }

  async getAllowance(merchant: string): Promise<AllowanceView> {
    return readAllowance(await this.policyClient(), this.walletAddress, merchant);
  }

  private kit(): PasskeyKit {
    const kit = new PasskeyKit({
      rpcUrl: this.rpcUrl,
      networkPassphrase: this.networkPassphrase,
      walletWasmHash: SMART_WALLET_WASM_HASH,
    });
    kit.wallet = new PasskeyClient({
      contractId: this.walletAddress,
      rpcUrl: this.rpcUrl,
      networkPassphrase: this.networkPassphrase,
      publicKey: this.owner.publicKey(),
    });
    return kit;
  }

  private policyClient(): Promise<PolicyClient> {
    return SorobanClient.from<PolicyClient>({
      contractId: this.policyContractId,
      rpcUrl: this.rpcUrl,
      networkPassphrase: this.networkPassphrase,
      publicKey: this.owner.publicKey(),
    }) as unknown as Promise<PolicyClient>;
  }

  /** Wallet auth entry (admin signer) + classic envelope signature (fee payer). */
  private async signAndSend(kit: PasskeyKit, tx: AssembledTransaction<unknown>, label: string): Promise<string> {
    const authorized = await kit.sign(tx, new Ed25519Signer(this.owner));
    // The first simulation ran in recording mode, before the wallet's
    // __check_auth had a signature to verify, so its footprint misses the
    // signer entry that check reads. Re-simulating with the signed entry
    // fixes the footprint (without it the tx traps on chain).
    await authorized.simulate();
    return this.submitBuilt(authorized.built, label);
  }

  /**
   * Signs the simulated transaction as it was built and sends it. Not
   * `AssembledTransaction.sign()` + `send()`: see MAX_INCLUSION_BID_STROOPS.
   * Returns "" in a dry run.
   */
  private async submitBuilt(built: AssembledTransaction<unknown>["built"], label: string): Promise<string> {
    if (!built) throw new Error(`${label}: transaction was not built`);
    const tx = withOwnFeeAndWindow(built, this.networkPassphrase);
    const resourceFee = BigInt(tx.toEnvelope().v1().tx().ext().sorobanData().resourceFee().toString());
    const fee = BigInt(tx.fee);
    this.onFee?.({ label, feeXlm: stroopsToXlm(fee), resourceFeeXlm: stroopsToXlm(resourceFee) });
    if (fee - resourceFee > MAX_INCLUSION_BID_STROOPS) {
      throw new Error(
        `${label}: fee bid ${stroopsToXlm(fee)} XLM is more than 0.1 XLM above the resource fee ${stroopsToXlm(resourceFee)} XLM; refusing to send`,
      );
    }
    if (this.dryRun) return "";

    tx.sign(this.owner);
    const sent = await this.server.sendTransaction(tx);
    if (sent.status === "ERROR") {
      const code = sent.errorResult?.result().switch().name ?? "unknown";
      throw new Error(`${label} was rejected by the network (${code}, tx ${sent.hash})`);
    }
    const final = await this.server.pollTransaction(sent.hash, { attempts: POLL_ATTEMPTS });
    if (final.status !== "SUCCESS") {
      throw new Error(`${label} failed on chain (status ${final.status}, tx ${sent.hash})`);
    }
    return sent.hash;
  }

  private async contractExists(contractId: string): Promise<boolean> {
    try {
      await this.server.getContractData(
        contractId,
        xdr.ScVal.scvLedgerKeyContractInstance(),
        rpc.Durability.Persistent,
      );
      return true;
    } catch {
      return false;
    }
  }
}

export interface PayMerchantOptions extends SpendPolicyNetworkOptions {
  /** The agent's key: the wallet sub-key, and the fee payer for this tx. */
  agent: Keypair;
  /** The smart wallet that holds the funds (`C…`). */
  walletAddress: string;
  token: string;
  merchant: string;
  /** Atomic units. */
  amount: bigint;
}

export interface PayMerchantResult {
  txHash: string;
  ledger: number;
}

/**
 * The agent's side: pays `amount` of `token` from the smart wallet to
 * `merchant`, authorized only by the agent's sub-key. The wallet's
 * `__check_auth` calls the policy, so a payment over a cap, to another
 * merchant, after pause/revoke or after the mandate lapses fails on chain
 * (simulation surfaces it first and nothing is submitted).
 */
export async function payMerchant(opts: PayMerchantOptions): Promise<PayMerchantResult> {
  assertContract(opts.walletAddress, "walletAddress");
  assertContract(opts.token, "token");
  if (opts.amount <= 0n) throw new Error("amount must be positive");

  const networkPassphrase = NETWORK_PASSPHRASES[opts.network];
  const rpcUrl = opts.rpcUrl ?? SOROBAN_RPC_ENDPOINTS[opts.network];
  const server = new rpc.Server(rpcUrl);
  const source = await server.getAccount(opts.agent.publicKey());

  const op = new Contract(opts.token).call(
    "transfer",
    new Address(opts.walletAddress).toScVal(),
    new Address(opts.merchant).toScVal(),
    nativeToScVal(opts.amount, { type: "i128" }),
  );
  const unsigned = new TransactionBuilder(source, { fee: INCLUSION_FEE_STROOPS, networkPassphrase })
    .addOperation(op)
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();

  // Recording-mode simulation yields the wallet's auth entry to sign.
  const recorded = await server.simulateTransaction(unsigned);
  if (rpc.Api.isSimulationError(recorded)) {
    throw new Error(`Payment simulation failed: ${recorded.error}`);
  }
  const auth = recorded.result?.auth ?? [];

  const kit = new PasskeyKit({ rpcUrl, networkPassphrase, walletWasmHash: SMART_WALLET_WASM_HASH });
  kit.wallet = new PasskeyClient({
    contractId: opts.walletAddress,
    rpcUrl,
    networkPassphrase,
    publicKey: opts.agent.publicKey(),
  });
  const { sequence } = await server.getLatestLedger();
  const signedAuth: xdr.SorobanAuthorizationEntry[] = [];
  for (const entry of auth) {
    const creds = entry.credentials();
    const isWallet =
      creds.switch().name !== "sorobanCredentialsSourceAccount" &&
      Address.fromScAddress(addressCredentials(creds).address()).toString() === opts.walletAddress;
    signedAuth.push(
      isWallet
        ? await kit.signAuthEntry(entry, new Ed25519Signer(opts.agent), {
            expiration: sequence + 60,
          })
        : entry,
    );
  }

  // Re-simulate with the signed entry so the footprint covers what
  // __check_auth reads (signer entries, the policy and its storage). This
  // run also executes the policy, so a refused payment stops here.
  const withAuth = new TransactionBuilder(await server.getAccount(opts.agent.publicKey()), {
    fee: INCLUSION_FEE_STROOPS,
    networkPassphrase,
  })
    .addOperation(
      new Contract(opts.token).call(
        "transfer",
        new Address(opts.walletAddress).toScVal(),
        new Address(opts.merchant).toScVal(),
        nativeToScVal(opts.amount, { type: "i128" }),
      ),
    )
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();
  const authed = attachAuth(withAuth, signedAuth, networkPassphrase);
  const enforced = await server.simulateTransaction(authed);
  if (rpc.Api.isSimulationError(enforced)) {
    throw new Error(`Payment refused on chain (simulation): ${enforced.error}`);
  }
  const ready = rpc.assembleTransaction(authed, enforced).build();
  const resourceFee = BigInt(ready.toEnvelope().v1().tx().ext().sorobanData().resourceFee().toString());
  const fee = BigInt(ready.fee);
  opts.onFee?.({ label: "payment", feeXlm: stroopsToXlm(fee), resourceFeeXlm: stroopsToXlm(resourceFee) });
  if (fee - resourceFee > MAX_INCLUSION_BID_STROOPS) {
    throw new Error(`payment: fee bid ${stroopsToXlm(fee)} XLM is more than 0.1 XLM above the resource fee; refusing to send`);
  }
  if (opts.dryRun) return { txHash: "", ledger: 0 };
  ready.sign(opts.agent);

  const sent = await server.sendTransaction(ready);
  if (sent.status === "ERROR") {
    throw new Error(`Payment submission failed: ${sent.errorResult?.toXDR("base64") ?? "unknown"}`);
  }
  const final = await server.pollTransaction(sent.hash, { attempts: POLL_ATTEMPTS });
  if (final.status !== "SUCCESS") {
    throw new Error(`Payment did not succeed on chain (status ${final.status}, tx ${sent.hash})`);
  }
  return { txHash: sent.hash, ledger: final.ledger };
}

/** Read-only view of a merchant's allowance; no key needed. */
export async function getMerchantAllowance(
  opts: SpendPolicyNetworkOptions & { walletAddress: string; merchant: string; publicKey: string },
): Promise<AllowanceView> {
  const client = (await SorobanClient.from<PolicyClient>({
    contractId: opts.policyContractId,
    rpcUrl: opts.rpcUrl ?? SOROBAN_RPC_ENDPOINTS[opts.network],
    networkPassphrase: NETWORK_PASSPHRASES[opts.network],
    publicKey: opts.publicKey,
  })) as unknown as PolicyClient;
  return readAllowance(client, opts.walletAddress, opts.merchant);
}

async function readAllowance(client: PolicyClient, wallet: string, merchant: string): Promise<AllowanceView> {
  const a = (await client.get_allowance({ wallet, merchant })).result;
  const available = (await client.available_today({ wallet, merchant })).result;
  const status = typeof a.status === "number" ? STATUS_BY_INDEX[a.status] : a.status.tag;
  if (!status) throw new Error(`Unknown allowance status ${JSON.stringify(a.status)}`);
  return {
    signer: StrKey.encodeEd25519PublicKey(Buffer.from(a.signer)),
    capPerTx: BigInt(a.cap_per_tx),
    capPerDay: BigInt(a.cap_per_day),
    status,
    expiresAt: Number(a.expires_at),
    availableToday: BigInt(available),
  };
}

function attachAuth(
  tx: ReturnType<TransactionBuilder["build"]>,
  auth: xdr.SorobanAuthorizationEntry[],
  networkPassphrase: string,
) {
  const env = tx.toEnvelope();
  const op = env.v1().tx().operations()[0];
  if (!op) throw new Error("transaction has no operation");
  op.body().invokeHostFunctionOp().auth(auth);
  return TransactionBuilder.fromXDR(env, networkPassphrase) as ReturnType<TransactionBuilder["build"]>;
}

function addressCredentials(creds: xdr.SorobanCredentials): xdr.SorobanAddressCredentials {
  // passkey-kit upgrades V1 address credentials to the address-bound V2 form
  // when signing; both expose `.address()`.
  const anyCreds = creds as unknown as { value(): xdr.SorobanAddressCredentials };
  return anyCreds.value();
}

/**
 * Rewrites a simulated transaction's fee to `resource fee + INCLUSION_FEE_STROOPS`
 * and its validity window to TX_TIMEOUT_SECONDS from now, whatever the client
 * that built it chose. Auth entries are untouched: their signatures cover the
 * invocation, nonce and expiration ledger, not the envelope's fee or time bounds.
 * Exported for its test only.
 */
export function withOwnFeeAndWindow(tx: NonNullable<AssembledTransaction<unknown>["built"]>, networkPassphrase: string) {
  const env = tx.toEnvelope();
  const inner = env.v1().tx();
  const resourceFee = BigInt(inner.ext().sorobanData().resourceFee().toString());
  inner.fee(Number(resourceFee + BigInt(INCLUSION_FEE_STROOPS)));
  const maxTime = Math.floor(Date.now() / 1000) + TX_TIMEOUT_SECONDS;
  inner.cond(
    xdr.Preconditions.precondTime(
      new xdr.TimeBounds({ minTime: xdr.Uint64.fromString("0"), maxTime: xdr.Uint64.fromString(String(maxTime)) }),
    ),
  );
  env.v1().signatures([]);
  return TransactionBuilder.fromXDR(env, networkPassphrase) as NonNullable<AssembledTransaction<unknown>["built"]>;
}

function stroopsToXlm(stroops: bigint): string {
  const v = stroops.toString().padStart(8, "0");
  return `${v.slice(0, -7)}.${v.slice(-7)}`;
}

function assertContract(id: string, name: string): void {
  if (!StrKey.isValidContract(id)) throw new Error(`${name} must be a C… contract address`);
}
