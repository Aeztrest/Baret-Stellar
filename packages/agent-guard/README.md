# @stellar-thorn/agent-guard

Pre-sign transaction firewall for **autonomous agents & program (bot) wallets** on
Stellar — the same Baret protection that guards human wallets, delivered as an
importable SDK **and** a `baret` CLI.

Your agent builds a transaction; agent-guard sends the XDR through Baret's
`/v1/analyze` (Horizon pre-state + Soroban preflight + risk detectors), applies
your policy, and only then — if the policy allows — signs and submits. Drains,
unlimited approvals and rogue-contract calls are **blocked, not signed**.

Built on top of [`@stellar-thorn/swig-guard`](../swig-guard) (the SDK-free guard)
plus `@stellar/stellar-sdk` for key handling and Horizon submission.

---

## Install

```bash
# Not published to npm (the package is marked private). Use it from a checkout of this monorepo:
pnpm install && pnpm build:guard && pnpm build:agent-guard   # then depend on it as a workspace package, or run: node packages/agent-guard/dist/cli.js
```

Requires Node ≥ 20 and a reachable Baret analyze server: run your own (`pnpm dev:server`, see the repo root) or use a hosted one. The server needs an API key: create a free one with `POST /v1/keys`
(see the developer portal at `/developers` on the showcase, or `apps/server`'s `GET /openapi.json`) and pass it as `BARET_API_KEY`.

---

## SDK

```ts
import { AgentWallet } from "@stellar-thorn/agent-guard";

const agent = AgentWallet.fromSecret(process.env.BARET_AGENT_SECRET!, {
  serverUrl: "http://localhost:8080",
  network: "testnet",
  policy: "balanced", // "strict" | "balanced" | "permissive" | GuardPolicy object
});

// You build the unsigned TransactionEnvelope XDR however you like.
try {
  const { hash, explorerUrl } = await agent.guardedSubmit(transactionXdr);
  console.log("sent:", hash, explorerUrl);
} catch (err) {
  // GuardBlockedError → policy refused it; the key never signed.
  // AnalyzeError      → server unreachable; fail-closed, nothing signed.
  console.error("not sent:", err.message);
}
```

### Three levels of involvement

| Method | Touches the key? | Submits? | Use when |
|--------|------------------|----------|----------|
| `evaluate(xdr)` | no | no | You want a verdict and will sign yourself |
| `guardedSign(xdr)` | yes (if allowed) | no | You submit through your own pipeline |
| `guardedSubmit(xdr)` | yes (if allowed) | yes | End-to-end: analyze → sign → broadcast |

`evaluate` returns a `GuardEvaluation` (`decision`, `blockingReasons`,
`advisoryFindings`, `analysis`). `guardedSign`/`guardedSubmit` throw
`GuardBlockedError` on a policy block.

Advisory-only without handing over the secret:

```ts
const watcher = new AgentWallet({ address: "G…AGENT", serverUrl, network: "testnet" });
const ev = await watcher.evaluate(transactionXdr);
if (ev.decision === "block") console.warn(ev.blockingReasons);
```

---

## CLI

```bash
baret <command> [<xdr>|-] [flags]
```

| Command | What it does | Secret? |
|---------|--------------|---------|
| `baret analyze <xdr\|->` | Print the verdict (allow/block, reasons, findings) | no |
| `baret sign <xdr\|->` | Analyze, then sign locally if allowed | yes |
| `baret submit <xdr\|->` | Analyze, sign, and broadcast to Horizon if allowed | yes |
| `baret address` | Print the agent `G…` address from the secret | yes |
| `baret init` | Write `~/.baret/config.json` from flags/env | no |
| `baret policy list` | List the built-in policy templates | no |

Flags: `--server <url>`, `--network testnet|pubnet`, `--policy <id\|json>`, `--address <G…>`, `--json`.
The API key is deliberately **not** a flag (it would land in shell history and `ps`); set `BARET_API_KEY`.

`<xdr>` may be `-` to read from **stdin**, so an agent in any language can pipe a
transaction in and branch on the exit code:

```bash
baret init --server http://localhost:8080 --network testnet --policy balanced
export BARET_AGENT_SECRET=S...your-agent-seed

echo "$XDR" | baret submit -
case $? in
  0) echo "sent" ;;
  1) echo "blocked by policy" ;;
  2) echo "error / server unreachable" ;;
esac
```

**Exit codes:** `0` allowed/success · `1` blocked by policy · `2` error.

---

## Configuration

Resolved highest-priority first: **explicit options/flags → env → `~/.baret/config.json` → defaults.**

| Setting | Env var | Notes |
|---------|---------|-------|
| Server URL | `BARET_API_URL` | default `http://localhost:8080` |
| API key | `BARET_API_KEY` | A key from `POST /v1/keys` (`baret_…`) or one of the server's `DELTAG_API_KEYS` |
| Network | `BARET_NETWORK` | `testnet` (default) or `pubnet` |
| Policy | `BARET_POLICY` | template id or inline JSON |
| Horizon URL | `BARET_HORIZON_URL` | defaults to the network's public Horizon |
| Pinned server key | `BARET_PINNED_SERVER_PUBLIC_KEY` | `G…` signing key of the server. When set, every verdict's Ed25519 `attestation` is verified; a missing/wrong/invalid one throws `AttestationError` (fail-closed). The server publishes its key at `GET /v1/meta` (`attestation.signerPublicKey`) when `BARET_SIGNING_SECRET` is configured; obtain the key out of band, since fetching it from the same server defeats the pin |
| **Agent secret** | `BARET_AGENT_SECRET` | `S…` seed — **only** read from env/explicit option |

---

## Security model

- **The secret is never persisted.** `baret init` writes everything *except* the
  seed; the agent key is only ever read from `BARET_AGENT_SECRET` (or an explicit
  `agentSecret` option) at runtime.
- **Fail-closed.** If the analyze server is unreachable, `evaluate` throws and no
  signing happens. `guardedSign({ allowOffline: true })` is an explicit emergency
  override — use only with out-of-band trust.
- **Verdict attestation (opt-in).** With `pinnedServerPublicKey` / `BARET_PINNED_SERVER_PUBLIC_KEY`, `evaluate()` verifies the server's signature over `(txHash, safe, findings, signedAt, nonce)`, where `txHash` is recomputed locally from the XDR you sent. A forged `safe:true` from a compromised server or proxy is rejected. `AttestationError` is not an `AnalyzeError`, so `allowOffline` can't bypass it.
- **The guard never bypasses your policy.** A blocked transaction is never signed;
  `guardedSubmit` simply never reaches the broadcast step.
