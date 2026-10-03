/**
 * Sets up and exercises on-chain agent spending limits (MerchantSpendPolicy)
 * on testnet or mainnet. Run with tsx from packages/agent-guard:
 *
 *   pnpm spend-policy <setup|status|fund|pause|resume|revoke|pay|prove [--daily]|allowance>
 *
 * Secrets come only from the environment (BARET_OWNER_SECRET,
 * BARET_AGENT_SECRET); nothing is written to disk. See
 * contracts/contracts/merchant-spend-policy/DEPLOYMENT.md for the full
 * runbook and which variables each command needs.
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
  SOROBAN_RPC_ENDPOINTS,
  SpendPolicyOwner,
  getMerchantAllowance,
  payMerchant,
  type AllowanceView,
} from "../src/spend-policy.js";

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
const netOpts = () => ({ network, rpcUrl, policyContractId: env("BARET_POLICY_CONTRACT_ID") });

function txLink(hash: string | undefined): string {
  return hash ? `${explorer}/tx/${hash}` : "(already done)";
}

function printAllowance(a: AllowanceView): void {
  console.log(
    `  status ${a.status} · per-tx ${fromAtomic(a.capPerTx)} · per-24h ${fromAtomic(a.capPerDay)} · ` +
      `available now ${fromAtomic(a.availableToday)} · expires ${new Date(a.expiresAt * 1000).toISOString()} · signer ${a.signer}`,
  );
}

function owner(): SpendPolicyOwner {
  return new SpendPolicyOwner(Keypair.fromSecret(env("BARET_OWNER_SECRET")), netOpts());
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
    token: env("BARET_TOKEN"),
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
      new Contract(env("BARET_TOKEN")).call(
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
    token: env("BARET_TOKEN"),
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
async function prove(): Promise<void> {
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
  if (process.argv.includes("--daily")) {
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

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "setup":
      return setup();
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
      return prove();
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
      console.error("usage: spend-policy <setup|status|fund|pause|resume|revoke|pay [amount]|prove [--daily]|allowance>");
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
