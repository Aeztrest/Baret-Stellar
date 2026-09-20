/**
 * Testnet liveness check for the on-chain pieces the wallet depends on.
 *
 * Testnet can be reset, and a persistent entry whose TTL lapses is archived, so
 * a demo that worked last week can be dead today. This checks that
 *   1. MerchantSpendPolicy is deployed and actually runs (a read-only call is
 *      simulated; needing a restore or hitting a missing contract fails),
 *   2. the smart-wallet wasm the extension deploys from still exists,
 *   3. the USDC token contract x402 pays in still exists.
 *
 * The policy contract id and the wallet wasm hash are read from the extension's
 * `smart-wallet-config.ts` so they are not copied a third time.
 *
 * Usage: pnpm --filter @stellar-thorn/server chain-check [--rpc <url>] [--min-days <n>]
 * Exit code 1 when a required piece is missing, archived or about to expire.
 */

import {
  Account,
  Address,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_RPC = "https://soroban-testnet.stellar.org";
const DEFAULT_MIN_DAYS = 14;
const SECONDS_PER_LEDGER = 5;
const USDC_SAC_TESTNET = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

export type CheckStatus = "ok" | "warn" | "fail";
export interface CheckResult {
  label: string;
  status: CheckStatus;
  detail: string;
}

/** `Error(Contract, #3)` is MerchantSpendPolicy's `NoAllowance`: the contract ran and answered. */
export function classifyPolicySimulation(sim: {
  error?: string;
  restoreRequired: boolean;
  succeeded: boolean;
}): Pick<CheckResult, "status" | "detail"> {
  if (sim.restoreRequired) {
    return { status: "fail", detail: "entries are archived; a restore transaction is needed before it can run" };
  }
  if (sim.succeeded) return { status: "ok", detail: "read-only call succeeded" };
  if (sim.error?.includes("Error(Contract, #3)")) {
    return { status: "ok", detail: "contract ran and answered (NoAllowance for an unknown wallet, as expected)" };
  }
  return { status: "fail", detail: `unexpected simulation error: ${(sim.error ?? "unknown").split("\n")[0]}` };
}

/**
 * `liveUntilLedgerSeq` is 0 for entries the RPC does not report a TTL for.
 * That happens for MerchantSpendPolicy's own entries on the public testnet RPC
 * even though they run fine (cause not verified), so 0 is "unknown", not "expired".
 */
export function classifyEntry(
  entry: { liveUntilLedgerSeq: number } | undefined,
  latestLedger: number,
  minDays: number,
): Pick<CheckResult, "status" | "detail"> {
  if (!entry) return { status: "fail", detail: "not found on this network (missing or archived)" };
  if (!entry.liveUntilLedgerSeq) return { status: "ok", detail: "exists (RPC reports no TTL for it)" };
  const days = ((entry.liveUntilLedgerSeq - latestLedger) * SECONDS_PER_LEDGER) / 86_400;
  if (days <= 0) return { status: "fail", detail: "TTL has lapsed" };
  const rounded = days.toFixed(1);
  if (days < minDays) return { status: "warn", detail: `exists, expires in ${rounded} days (< ${minDays})` };
  return { status: "ok", detail: `exists, ${rounded} days of TTL left` };
}

function readExtensionConstants(): { policyId: string; walletWasmHash: string } {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, "../../../extension/src/background/swig/smart-wallet-config.ts");
  const src = readFileSync(file, "utf8");
  const policyId = /MERCHANT_SPEND_POLICY_CONTRACT_ID[^=]*=\s*"(C[A-Z2-7]{55})"/.exec(src)?.[1];
  const walletWasmHash = /SMART_WALLET_WASM_HASH\s*=\s*"([0-9a-f]{64})"/.exec(src)?.[1];
  if (!policyId || !walletWasmHash) {
    throw new Error(`Could not read the policy contract id / wallet wasm hash from ${file}; update the patterns in chain-check.ts.`);
  }
  return { policyId, walletWasmHash };
}

const instanceKey = (contractId: string) =>
  xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );

const codeKey = (hashHex: string) =>
  xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(hashHex, "hex") }));

async function checkPolicy(server: rpc.Server, policyId: string): Promise<CheckResult> {
  const label = `MerchantSpendPolicy ${policyId.slice(0, 8)}…`;
  const source = new Account(Keypair.random().publicKey(), "0");
  const tx = new TransactionBuilder(source, { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(
      new Contract(policyId).call(
        "get_allowance",
        new Address(Keypair.random().publicKey()).toScVal(),
        new Address(Keypair.random().publicKey()).toScVal(),
      ),
    )
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  const restoreRequired = "restorePreamble" in sim && Boolean(sim.restorePreamble);
  return {
    label,
    ...classifyPolicySimulation({
      error: rpc.Api.isSimulationError(sim) ? sim.error : undefined,
      restoreRequired,
      succeeded: rpc.Api.isSimulationSuccess(sim),
    }),
  };
}

async function checkEntry(
  server: rpc.Server,
  label: string,
  key: xdr.LedgerKey,
  latestLedger: number,
  minDays: number,
): Promise<CheckResult> {
  const res = await server.getLedgerEntries(key);
  const entry = res.entries[0];
  return { label, ...classifyEntry(entry && { liveUntilLedgerSeq: entry.liveUntilLedgerSeq ?? 0 }, latestLedger, minDays) };
}

function parseArgs(argv: string[]): { rpcUrl: string; minDays: number } {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const minDays = Number(get("--min-days") ?? DEFAULT_MIN_DAYS);
  if (!Number.isFinite(minDays) || minDays < 0) throw new Error("--min-days must be a non-negative number");
  return { rpcUrl: get("--rpc") ?? process.env.STELLAR_SOROBAN_RPC_URL ?? DEFAULT_RPC, minDays };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const { rpcUrl, minDays } = parseArgs(argv);
  const { policyId, walletWasmHash } = readExtensionConstants();
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  const { sequence: latestLedger } = await server.getLatestLedger();

  const results = await Promise.all([
    checkPolicy(server, policyId),
    checkEntry(server, `smart-wallet wasm ${walletWasmHash.slice(0, 8)}…`, codeKey(walletWasmHash), latestLedger, minDays),
    checkEntry(server, "USDC token contract (x402 asset)", instanceKey(USDC_SAC_TESTNET), latestLedger, minDays),
  ]);

  console.log(`chain-check on ${rpcUrl} (ledger ${latestLedger}, warn below ${minDays} days)\n`);
  for (const r of results) console.log(`  [${r.status.toUpperCase().padEnd(4)}] ${r.label}: ${r.detail}`);

  const bad = results.filter((r) => r.status !== "ok");
  if (bad.length) {
    console.error(
      `\n${bad.length} check(s) need attention. To extend a TTL: stellar contract extend --id <C…> (or --wasm-hash <hash>) --ledgers-to-extend <n> --source-account <key> --network testnet. To redeploy: contracts/contracts/merchant-spend-policy/DEPLOYMENT.md.`,
    );
    return 1;
  }
  console.log("\nAll checks passed.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(2);
    },
  );
}
