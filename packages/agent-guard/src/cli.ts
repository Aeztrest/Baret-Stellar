#!/usr/bin/env node
/**
 * `baret`. command-line firewall for agent / program wallets.
 *
 * Every subcommand resolves config from flags → env (BARET_*) → ~/.baret/config.json.
 * Designed to be scripted from ANY language: build a transaction, pipe its XDR
 * to `baret submit -`, and branch on the exit code.
 *
 * Exit codes:
 *   0  allowed / success
 *   1  blocked by policy
 *   2  error (bad input, unreachable server, missing secret, …)
 */

import { parseArgs } from "node:util";
import { Keypair } from "@stellar/stellar-sdk";
import {
  AgentWallet,
  GuardBlockedError,
  AnalyzeError,
  POLICY_TEMPLATES,
  writeConfigFile,
  readConfigFile,
  loadConfig,
  CONFIG_PATH,
  type GuardEvaluation,
  type RiskFinding,
  type StellarNetwork,
  type AgentWalletOptions,
  type PersistedConfig,
} from "./index.js";

const EXIT_OK = 0;
const EXIT_BLOCKED = 1;
const EXIT_ERROR = 2;

interface GlobalFlags {
  server?: string;
  network?: StellarNetwork;
  policy?: string;
  address?: string;
  json: boolean;
}

function fail(message: string, json: boolean): never {
  if (json) {
    process.stdout.write(JSON.stringify({ ok: false, error: message }) + "\n");
  } else {
    process.stderr.write(`baret: ${message}\n`);
  }
  process.exit(EXIT_ERROR);
}

/** Read an XDR argument, supporting `-` (stdin). */
async function resolveXdr(arg: string | undefined, json: boolean): Promise<string> {
  if (!arg) fail("missing <xdr> argument (use '-' to read from stdin)", json);
  if (arg !== "-") return arg.trim();

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const stdin = Buffer.concat(chunks).toString("utf8").trim();
  if (!stdin) fail("no XDR received on stdin", json);
  return stdin;
}

function walletOptions(flags: GlobalFlags): AgentWalletOptions {
  return {
    serverUrl: flags.server,
    network: flags.network,
    policy: flags.policy,
    // apiKey is intentionally not settable via CLI flag — only BARET_API_KEY
    // (env var), so it never appears in shell history or `ps` output, same
    // as BARET_AGENT_SECRET.
  };
}

/* ───────────────────────── rendering ───────────────────────── */

function severityTag(s: RiskFinding["severity"]): string {
  return { low: "·", medium: "▲", high: "✕", critical: "✕✕" }[s] ?? "·";
}

function printEvaluation(ev: GuardEvaluation, json: boolean, address: string): void {
  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          decision: ev.decision,
          address,
          blockingReasons: ev.blockingReasons,
          advisoryFindings: ev.advisoryFindings,
          analysis: ev.analysis,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  const verdict = ev.decision === "allow" ? "✓ ALLOW" : "✕ BLOCK";
  process.stdout.write(`\n  ${verdict}   agent ${address}\n`);

  if (ev.decision === "block") {
    const reasons = ev.blockingReasons.length
      ? ev.blockingReasons
      : ["Blocked by policy (see risk findings below)."];
    process.stdout.write("\n  Blocking reasons:\n");
    for (const r of reasons) process.stdout.write(`    • ${r}\n`);
  }

  const findings = ev.analysis.riskFindings ?? [];
  if (findings.length) {
    process.stdout.write("\n  Risk findings:\n");
    for (const f of findings) {
      process.stdout.write(`    ${severityTag(f.severity)} [${f.severity}] ${f.code}. ${f.message}\n`);
    }
  }

  const changes = ev.analysis.estimatedChanges;
  const nativeMoves = changes?.native?.filter((n) => n.deltaStroops && n.deltaStroops !== "0") ?? [];
  if (nativeMoves.length) {
    process.stdout.write("\n  Estimated XLM changes:\n");
    for (const n of nativeMoves) {
      const xlm = (Number(n.deltaStroops) / 1e7).toFixed(7);
      process.stdout.write(`    ${n.accountId.slice(0, 8)}…  ${xlm} XLM\n`);
    }
  }
  process.stdout.write("\n");
}

/* ───────────────────────── commands ───────────────────────── */

async function cmdAnalyze(xdrArg: string | undefined, flags: GlobalFlags): Promise<number> {
  const xdr = await resolveXdr(xdrArg, flags.json);
  // Advisory: no secret needed. Attribute to the secret-derived address, an
  // explicit --address, or analyze with no attribution.
  const hasSecret = !!process.env.BARET_AGENT_SECRET;
  const wallet = new AgentWallet({ ...walletOptions(flags), address: flags.address });
  try {
    let ev: GuardEvaluation;
    let address: string;
    if (hasSecret || flags.address) {
      address = wallet.address;
      ev = await wallet.evaluate(xdr);
    } else {
      address = "(no attribution)";
      ev = await wallet.evaluate(xdr, { userWallet: "" });
    }
    printEvaluation(ev, flags.json, address);
    return ev.decision === "allow" ? EXIT_OK : EXIT_BLOCKED;
  } catch (err) {
    if (err instanceof AnalyzeError) {
      fail(`analyze server unreachable (fail-closed): ${err.message}`, flags.json);
    }
    fail(err instanceof Error ? err.message : String(err), flags.json);
  }
}

async function cmdSign(xdrArg: string | undefined, flags: GlobalFlags): Promise<number> {
  const xdr = await resolveXdr(xdrArg, flags.json);
  const wallet = new AgentWallet(walletOptions(flags));
  if (!wallet.canSign) fail("set BARET_AGENT_SECRET to sign", flags.json);
  try {
    const { signedXdr, analysis, bypassedOffline } = await wallet.guardedSign(xdr);
    if (flags.json) {
      process.stdout.write(
        JSON.stringify({ ok: true, signedXdr, analysis, bypassedOffline }, null, 2) + "\n",
      );
    } else {
      const warning = bypassedOffline
        ? "\n  ⚠ SIGNED WITHOUT A BARET VERDICT (allowOffline — analyze server was unreachable)\n"
        : "";
      process.stdout.write(`\n  ✓ ALLOW. signed by ${wallet.address}\n${warning}\n${signedXdr}\n\n`);
    }
    return EXIT_OK;
  } catch (err) {
    return handleSignError(err, flags);
  }
}

async function cmdSubmit(xdrArg: string | undefined, flags: GlobalFlags): Promise<number> {
  const xdr = await resolveXdr(xdrArg, flags.json);
  const wallet = new AgentWallet(walletOptions(flags));
  if (!wallet.canSign) fail("set BARET_AGENT_SECRET to submit", flags.json);
  try {
    const res = await wallet.guardedSubmit(xdr);
    if (flags.json) {
      process.stdout.write(
        JSON.stringify(
          { ok: true, hash: res.hash, explorerUrl: res.explorerUrl, bypassedOffline: res.bypassedOffline },
          null,
          2,
        ) + "\n",
      );
    } else {
      const warning = res.bypassedOffline
        ? "\n  ⚠ SUBMITTED WITHOUT A BARET VERDICT (allowOffline — analyze server was unreachable)\n"
        : "";
      process.stdout.write(
        `\n  ✓ SUBMITTED by ${wallet.address}\n${warning}    hash: ${res.hash}\n    ${res.explorerUrl}\n\n`,
      );
    }
    return EXIT_OK;
  } catch (err) {
    return handleSignError(err, flags);
  }
}

function handleSignError(err: unknown, flags: GlobalFlags): number {
  if (err instanceof GuardBlockedError) {
    if (flags.json) {
      process.stdout.write(
        JSON.stringify(
          { ok: false, decision: "block", blockingReasons: err.blockingReasons, analysis: err.analysis },
          null,
          2,
        ) + "\n",
      );
    } else {
      const reasons = err.blockingReasons.length ? err.blockingReasons : [err.message];
      process.stderr.write(`\n  ✕ BLOCK. not signed\n`);
      for (const r of reasons) process.stderr.write(`    • ${r}\n`);
      process.stderr.write("\n");
    }
    return EXIT_BLOCKED;
  }
  if (err instanceof AnalyzeError) {
    fail(`analyze server unreachable (fail-closed, not signed): ${err.message}`, flags.json);
  }
  fail(err instanceof Error ? err.message : String(err), flags.json);
}

function cmdAddress(flags: GlobalFlags): number {
  const secret = process.env.BARET_AGENT_SECRET;
  if (!secret) fail("set BARET_AGENT_SECRET to derive an address", flags.json);
  let address: string;
  try {
    address = Keypair.fromSecret(secret).publicKey();
  } catch {
    return fail("BARET_AGENT_SECRET is not a valid Stellar secret (S…)", flags.json);
  }
  if (flags.json) process.stdout.write(JSON.stringify({ ok: true, address }) + "\n");
  else process.stdout.write(address + "\n");
  return EXIT_OK;
}

function cmdPolicyList(flags: GlobalFlags): number {
  if (flags.json) {
    process.stdout.write(JSON.stringify(POLICY_TEMPLATES, null, 2) + "\n");
    return EXIT_OK;
  }
  process.stdout.write("\n  Policy templates:\n");
  for (const t of POLICY_TEMPLATES) {
    process.stdout.write(`\n  ${t.id.padEnd(11)} ${t.name}\n    ${t.description}\n`);
  }
  process.stdout.write("\n");
  return EXIT_OK;
}

function cmdInit(flags: GlobalFlags): number {
  // Resolve from flags + env (NOT the existing file, so init reflects intent),
  // then persist everything except the secret.
  const resolved = loadConfig(walletOptions(flags), { configPath: "/dev/null" });
  const policyInput = flags.policy ?? process.env.BARET_POLICY;
  const next: PersistedConfig = {
    serverUrl: resolved.serverUrl,
    network: resolved.network,
    ...(resolved.apiKey ? { apiKey: resolved.apiKey } : {}),
    // Store the template id verbatim when given one; an inline JSON policy as an
    // object; nothing given → the default template id.
    policy: isTemplateId(policyInput)
      ? policyInput
      : policyInput
        ? resolved.policy
        : "balanced",
    ...(flags.server || process.env.BARET_HORIZON_URL ? { horizonUrl: resolved.horizonUrl } : {}),
  };
  writeConfigFile(next);
  const existing = readConfigFile();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, path: CONFIG_PATH, config: existing }) + "\n");
  } else {
    process.stdout.write(`\n  Wrote ${CONFIG_PATH}\n`);
    process.stdout.write(`    server:  ${next.serverUrl}\n`);
    process.stdout.write(`    network: ${next.network}\n`);
    process.stdout.write(`    policy:  ${typeof next.policy === "string" ? next.policy : "custom"}\n`);
    process.stdout.write(`    apiKey:  ${next.apiKey ? "set" : ". "}\n`);
    process.stdout.write(`\n  The agent secret is never stored here. pass BARET_AGENT_SECRET at runtime.\n\n`);
  }
  return EXIT_OK;
}

function isTemplateId(v: string | undefined): v is "strict" | "balanced" | "permissive" {
  return v === "strict" || v === "balanced" || v === "permissive";
}

function printHelp(): void {
  process.stdout.write(`
  baret. pre-sign firewall for agent & program wallets

  Usage
    baret <command> [<xdr>|-] [flags]

  Commands
    analyze <xdr|->   Analyze a transaction and print the verdict (no secret needed)
    sign    <xdr|->   Analyze, then sign locally if the policy allows
    submit  <xdr|->   Analyze, sign, and broadcast to Horizon if allowed
    address           Print the agent G… address (from BARET_AGENT_SECRET)
    init              Write ~/.baret/config.json from flags / env
    policy list       List the built-in policy templates

  Flags
    --server <url>    Baret analyze server (env BARET_API_URL)
    --network <net>   testnet | pubnet (env BARET_NETWORK)
    --policy <id>     strict | balanced | permissive | <json> (env BARET_POLICY)
    --address <G…>    Attribute analysis to this address (advisory, no secret)
    --json            Machine-readable output
    -h, --help        Show this help

  Secrets (env vars only — never as a flag, to keep them out of shell
  history / process listings)
    BARET_AGENT_SECRET   ed25519 seed (S…). required only for sign / submit.
    BARET_API_KEY        Bearer key for the analyze server, if it requires one.

  Exit codes: 0 allowed/ok · 1 blocked by policy · 2 error
`);
}

/* ───────────────────────── entrypoint ───────────────────────── */

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      server: { type: "string" },
      network: { type: "string" },
      policy: { type: "string" },
      address: { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const json = values.json ?? false;

  if (values.help || positionals.length === 0) {
    printHelp();
    return positionals.length === 0 ? EXIT_OK : EXIT_OK;
  }

  const network = values.network;
  if (network !== undefined && network !== "testnet" && network !== "pubnet") {
    fail(`--network must be testnet or pubnet (got "${network}")`, json);
  }

  const flags: GlobalFlags = {
    server: values.server,
    network: network as StellarNetwork | undefined,
    policy: values.policy,
    address: values.address,
    json,
  };

  const [command, sub] = positionals;

  switch (command) {
    case "analyze":
      return cmdAnalyze(sub, flags);
    case "sign":
      return cmdSign(sub, flags);
    case "submit":
      return cmdSubmit(sub, flags);
    case "address":
      return cmdAddress(flags);
    case "init":
      return cmdInit(flags);
    case "policy":
      if (sub === "list" || sub === undefined) return cmdPolicyList(flags);
      fail(`unknown policy subcommand "${sub}" (try: baret policy list)`, json);
      break;
    case "help":
      printHelp();
      return EXIT_OK;
    default:
      fail(`unknown command "${command}" (try: baret --help)`, json);
  }
  return EXIT_OK;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`baret: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(EXIT_ERROR);
  });
