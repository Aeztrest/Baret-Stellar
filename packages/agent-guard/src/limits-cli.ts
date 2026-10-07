/**
 * `baret limits …`: sets up and exercises on-chain agent spending limits
 * (MerchantSpendPolicy) on testnet or mainnet. Loaded on demand by cli.ts so
 * the firewall commands don't pay for passkey-kit; `pnpm spend-policy` in
 * this repo runs the same code through scripts/spend-policy.ts.
 *
 * Secrets come only from the environment (BARET_OWNER_SECRET,
 * BARET_AGENT_SECRET); nothing is written to disk. The runbook and what each
 * command needs: contracts/contracts/merchant-spend-policy/DEPLOYMENT.md.
 */

import {
  Address,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
} from "@stellar/stellar-sdk";
import {
  MERCHANT_SPEND_POLICY_CONTRACT_IDS,
  SOROBAN_RPC_ENDPOINTS,
  SpendPolicyOwner,
  USDC_CONTRACT_IDS,
  getMerchantAllowance,
  payMerchant,
  type AllowanceView,
} from "./spend-policy.js";

type Net = "testnet" | "pubnet";

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function optEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

/** "0.5" → 5_000_000n (7 decimals, SAC convention). */
function toAtomic(decimal: string): bigint {
  if (!/^\d+(\.\d{1,7})?$/.test(decimal)) throw new Error(`Bad amount: ${decimal}`);
  const [whole, frac = ""] = decimal.split(".");
  return BigInt(whole ?? "0") * 10_000_000n + BigInt((frac + "0000000").slice(0, 7));
}

function fromAtomic(v: bigint): string {
  const s = v.toString().padStart(8, "0");
  return `${s.slice(0, -7)}.${s.slice(-7)}`.replace(/\.?0+$/, "") || "0";
}

const network = (optEnv("BARET_NETWORK") ?? "testnet") as Net;
if (network !== "testnet" && network !== "pubnet") throw new Error("BARET_NETWORK must be testnet or pubnet");
const passphrase = network === "pubnet" ? Networks.PUBLIC : Networks.TESTNET;
const rpcUrl = optEnv("BARET_RPC_URL") ?? SOROBAN_RPC_ENDPOINTS[network];
const explorer = `https://stellar.expert/explorer/${network === "pubnet" ? "public" : "testnet"}`;
// BARET_DRY_RUN=1 builds and simulates every step, prints its fee and sends nothing.
const dryRun = optEnv("BARET_DRY_RUN") === "1";
const netOpts = () => ({
  network,
  rpcUrl,
  policyContractId: optEnv("BARET_POLICY_CONTRACT_ID") ?? MERCHANT_SPEND_POLICY_CONTRACT_IDS[network],
  dryRun,
  onFee: (f: { label: string; feeXlm: string; resourceFeeXlm: string }) =>
    console.log(`  ${dryRun ? "[dry run, not sent] " : ""}${f.label}: fee ${f.feeXlm} XLM (resource ${f.resourceFeeXlm})`),
});

/** Defaults to Circle USDC on the selected network. */
function token(): string {
  return optEnv("BARET_TOKEN") ?? USDC_CONTRACT_IDS[network];
}

function txLink(hash: string | undefined): string {
  if (dryRun) return "(dry run)";
  return hash ? `${explorer}/tx/${hash}` : "(already done)";
}

function printAllowance(a: AllowanceView): void {
  console.log(
    `  status ${a.status} · per-tx ${fromAtomic(a.capPerTx)} · per-24h ${fromAtomic(a.capPerDay)} · ` +
      `available now ${fromAtomic(a.availableToday)} · expires ${new Date(a.expiresAt * 1000).toISOString()} · signer ${a.signer}`,
  );
}

function owner(): SpendPolicyOwner {
  // A dry run of the wallet deploy needs no signature, so the owner's public
  // key is enough for it; later steps sign a wallet auth entry even to simulate.
  const pub = optEnv("BARET_OWNER_PUBLIC");
  const key = dryRun && pub ? Keypair.fromPublicKey(pub) : Keypair.fromSecret(env("BARET_OWNER_SECRET"));
  return new SpendPolicyOwner(key, netOpts());
}

function agentKey(): Keypair {
  return Keypair.fromSecret(env("BARET_AGENT_SECRET"));
}

function agentPublic(): string {
  return optEnv("BARET_AGENT_PUBLIC") ?? agentKey().publicKey();
}

async function setup(): Promise<void> {
  const o = owner();
  console.log(`network ${network} · policy ${o.policyContractId}`);
  const wallet = await o.ensureWallet();
  console.log(`wallet  ${wallet.walletAddress}  ${txLink(wallet.txHash)}`);
  const install = await o.ensurePolicyInstalled();
  console.log(`policy installed on wallet  ${txLink(install.txHash)}`);
  const grant = await o.grantMerchant({
    merchant: env("BARET_MERCHANT"),
    agentPublicKey: agentPublic(),
    token: token(),
    capPerTx: toAtomic(env("BARET_CAP_PER_TX")),
    capPerDay: toAtomic(env("BARET_CAP_PER_DAY")),
    mandateSeconds: Number(optEnv("BARET_MANDATE_DAYS") ?? "30") * 86_400,
  });
  console.log(`set_allowance  ${txLink(grant.allowanceTxHash)}`);
  console.log(`agent key added as wallet signer  ${txLink(grant.signerTxHash)}`);
  printAllowance(await o.getAllowance(env("BARET_MERCHANT")));
  console.log(`contract: ${explorer}/contract/${o.policyContractId}`);
}

async function status(): Promise<void> {
  const o = owner();
  console.log(`wallet ${o.walletAddress}`);
  printAllowance(await o.getAllowance(env("BARET_MERCHANT")));
}

/** Moves `BARET_FUND_AMOUNT` of the token from the owner's G account into the wallet. */
async function fund(): Promise<void> {
  const ownerKey = Keypair.fromSecret(env("BARET_OWNER_SECRET"));
  const o = owner();
  const server = new rpc.Server(rpcUrl);
  const tx = new TransactionBuilder(await server.getAccount(ownerKey.publicKey()), {
    fee: "1000000",
    networkPassphrase: passphrase,
  })
    .addOperation(
      new Contract(token()).call(
        "transfer",
        new Address(ownerKey.publicKey()).toScVal(),
        new Address(o.walletAddress).toScVal(),
        nativeToScVal(toAtomic(env("BARET_FUND_AMOUNT")), { type: "i128" }),
      ),
    )
    .setTimeout(30)
    .build();
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(ownerKey);
  const sent = await server.sendTransaction(prepared);
  const final = await server.pollTransaction(sent.hash, { attempts: 20 });
  if (final.status !== "SUCCESS") throw new Error(`fund failed (status ${final.status})`);
  console.log(`funded ${o.walletAddress} with ${env("BARET_FUND_AMOUNT")}  ${txLink(sent.hash)}`);
}

async function pay(amount: string): Promise<string> {
  const res = await payMerchant({
    ...netOpts(),
    agent: agentKey(),
    walletAddress: env("BARET_WALLET"),
    token: token(),
    merchant: env("BARET_MERCHANT"),
    amount: toAtomic(amount),
  });
  return res.txHash;
}

/** MerchantSpendPolicy error codes (contracts/contracts/merchant-spend-policy/src/lib.rs). */
const POLICY_ERRORS = { NotActive: 4, ExceedsPerTx: 5, ExceedsDailyCap: 6 } as const;

/**
 * Expects the policy to refuse a payment with one specific error. Any other
 * failure (RPC, a bug in this script) fails the proof instead of counting as
 * a refusal.
 */
async function expectRefused(reason: keyof typeof POLICY_ERRORS, amount: string): Promise<void> {
  const code = `Error(Contract, #${POLICY_ERRORS[reason]})`;
  let hash: string;
  try {
    hash = await pay(amount);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes(code)) throw new Error(`Payment of ${amount} failed, but not with ${reason} ${code}:\n${msg}`);
    console.log(`  ✓ ${amount} refused by the contract: ${reason} ${code}`);
    return;
  }
  throw new Error(`Expected ${reason}, but the payment of ${amount} went through: ${txLink(hash)}`);
}

/**
 * The enforcement proof: a payment inside the caps goes through with only
 * the agent's key; an over-cap payment, a payment while paused and a payment
 * past the rolling 24h cap are refused by the contract.
 */
async function prove(daily: boolean): Promise<void> {
  const o = owner();
  const merchant = env("BARET_MERCHANT");
  const before = await o.getAllowance(merchant);
  printAllowance(before);
  if (before.status !== "Active") throw new Error("allowance is not Active; run resume first");

  const within = env("BARET_PAY_AMOUNT");
  const hash = await pay(within);
  console.log(`  ✓ paid ${within} within the caps, signed by the agent key only  ${txLink(hash)}`);

  await expectRefused("ExceedsPerTx", fromAtomic(before.capPerTx + 1n));

  const pauseHash = await o.pause(merchant);
  console.log(`  paused by owner  ${txLink(pauseHash)}`);
  await expectRefused("NotActive", within);
  const resumeHash = await o.resume(merchant);
  console.log(`  resumed by owner  ${txLink(resumeHash)}`);

  // Spend down to the rolling 24h cap at full per-tx size, then one more.
  if (daily) {
    let left = (await o.getAllowance(merchant)).availableToday;
    while (left >= before.capPerTx) {
      const h = await pay(fromAtomic(before.capPerTx));
      console.log(`  ✓ paid ${fromAtomic(before.capPerTx)}  ${txLink(h)}`);
      left -= before.capPerTx;
    }
    await expectRefused("ExceedsDailyCap", fromAtomic(before.capPerTx));
  }

  printAllowance(await o.getAllowance(merchant));
}

export const LIMITS_USAGE =
  "limits <setup|wallet|install|status|allowance|fund|pay [amount]|pause|resume|revoke|prove [--daily]>";

/** Runs one `limits` subcommand. Throws on failure; the caller sets the exit code. */
export async function runLimitsCli(args: string[]): Promise<void> {
  const [cmd, arg] = args.filter((a) => !a.startsWith("--"));
  switch (cmd) {
    case "setup":
      return setup();
    // The first two steps of `setup` on their own, to check each one's cost
    // on mainnet before sending the next.
    case "wallet": {
      const w = await owner().ensureWallet();
      console.log(`wallet  ${w.walletAddress}  ${txLink(w.txHash)}`);
      return;
    }
    case "install":
      console.log(`policy installed on wallet  ${txLink((await owner().ensurePolicyInstalled()).txHash)}`);
      return;
    case "status":
      return status();
    case "fund":
      return fund();
    case "pause":
      console.log(txLink(await owner().pause(env("BARET_MERCHANT"))));
      return;
    case "resume":
      console.log(txLink(await owner().resume(env("BARET_MERCHANT"))));
      return;
    case "revoke":
      console.log(txLink(await owner().revoke(env("BARET_MERCHANT"))));
      return;
    case "pay":
      console.log(txLink(await pay(arg ?? env("BARET_PAY_AMOUNT"))));
      return;
    case "prove":
      return prove(args.includes("--daily"));
    case "allowance": {
      printAllowance(
        await getMerchantAllowance({
          ...netOpts(),
          walletAddress: env("BARET_WALLET"),
          merchant: env("BARET_MERCHANT"),
          publicKey: agentPublic(),
        }),
      );
      return;
    }
    default:
      throw new Error(`usage: baret ${LIMITS_USAGE}`);
  }
}
