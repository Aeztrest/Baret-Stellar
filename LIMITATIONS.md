# Known limitations

What Baret does **not** guarantee yet, and how to read its results. Three parts: the HTTP analyze API, the wallet extension, and the platform as a whole.
For the per-feature ledger (built / partial / not built) see [`docs/implementation-status.md`](./docs/implementation-status.md) (Turkish).
Last reviewed against the code: 2026-09-19.

**Baret is testnet software.** It has not been independently audited (no audit is recorded in this repository), it targets Stellar testnet, and nothing here should be used to protect real funds.

## HTTP analyze API (`apps/server`)

The server's environment variables still use the old project name (`DELTAG_*`); they are active and required.

### Simulation vs on-chain execution

- The service uses Stellar **Soroban RPC `simulateTransaction`** (preflight) plus Horizon account state. Results reflect **simulated** state, not guaranteed final execution outcomes.
- Before preflight the server strips the transaction's Soroban auth entries so unsigned address-credential auth (e.g. an x402 payment awaiting the user's signature) runs in recording mode. Balance deltas are the same, but a signature problem inside an entry is not something this simulation can find.
- Network conditions, time-bound expiry, fee changes, and runtime differences can cause real execution to diverge from simulation.
- `POST /v1/replay` re-simulates against **current** ledger state (`isHistorical: false`); Stellar does not offer historical preflight, and the optional `ledger` field is informational.

### Transaction format

- Only **Stellar `TransactionEnvelope`** payloads are supported, provided as **base64 XDR** (`transactionXdr`). Fee-bump envelopes are analysed through their inner transaction.
- The server is bound to **one network** (testnet or pubnet). A request for the other one gets `WRONG_NETWORK`.

### Account and instruction coverage

- Pre-state is fetched for at most `MAX_SIMULATION_OPERATIONS` (default **20**, max 100) classic accounts per request. Accounts beyond that are not included; the response then carries `LOW_CONFIDENCE_INCOMPLETE_DATA` and lower confidence.
- The Soroban auth tree is parsed to depth 64 / 5,000 nodes; larger trees are truncated and flagged.
- Heuristics operate on **observed** contracts, token flows and operations. Unknown or novel contract behaviour may be under-detected.
- `maxLossPercent` only measures **native XLM**; it does not consider token losses. Use `minPostUsdcBalance` for a token floor.

### Analysis coverage

- `KNOWN_MALICIOUS_ADDRESS` uses a tiny seed reputation list; it never blocks by itself (no policy option gates it), so absence of the finding is not evidence of safety.
- Several finding codes exist in the response type but are not emitted yet; `GET /v1/detectors?status=reserved` lists them.
- Fee/memo/asset findings (`EXCESSIVE_*_FEE`, `X402_MEMO_MISSING`, `X402_NON_CANONICAL_ASSET`) are advisory: they do not change `safe`.
- The MCP `baret_list_profiles` tool and the `policyProfile` argument describe policy profiles that are not applied to `/v1/analyze`; use the `policy` object instead.
- An empty `policy` still blocks failed simulations and incomplete data (set `allowWarnings: true` / `requireSuccessfulSimulation: false` to relax).

### x402 settlement

- When x402 is enabled, payment is verified in a **pre-handler** before analysis runs. The server **validates the JSON response shape (Zod) before settlement**: if validation fails, the client receives an error and **settlement is not executed** (no payment finalization for that request).
- **Settlement** runs only after analyze completes and response schema validation succeeds, immediately before sending `200` with the validated body.
- If analysis throws, validation fails, or settlement fails, behavior differs: verified-but-not-settled payment state is possible on failures after verify; clients should treat facilitator/settlement errors (`FACILITATOR_ERROR`, HTTP 502) as distinct from policy outcomes (`safe` / `reasons`).
- x402 payment only covers `POST /v1/analyze`. Every other `/v1` and `/mcp` route needs an API key.
- The demo merchants (`/demo/scrybe`, `/demo/cortex`) exist only when `X402_MERCHANT_SECRET` is set, and settlement depends on the public facilitator being reachable.

### Rate limiting

- The server may enforce per-IP rate limits (`DELTAG_RATE_LIMIT_MAX`, `DELTAG_RATE_LIMIT_WINDOW_MS`). Health endpoints are excluded. For multi-instance deployments, enforce limits at the edge (API gateway / CDN); counters are in process memory.

### RPC reliability

- Each Horizon / Soroban RPC call has a hard timeout (`STELLAR_RPC_TIMEOUT_MS`, default 5 s) and is **not** retried automatically; clients own the retry (the wallet popup has "Retry analysis"). Failures surface as `RPC_ERROR` (HTTP 502, or 504 on timeout).
- The hosted demo server runs on a free plan that sleeps when idle; the first request after a pause can take about 30 s.

### Developer API keys

- Keys created with `POST /v1/keys` are stored as SHA-256 hashes in `keys.json` under `BARET_DATA_DIR`. **On hosts with an ephemeral disk (Render's free plan, containers without a volume) that file is wiped on every restart or spin-down**, so issued keys stop working and developers must create new ones. Mount a persistent disk/volume on `BARET_DATA_DIR` to keep them. `GET /v1/meta` reports `auth.keyIssuance.persistent`, but that only says the directory was writable, not that the disk survives restarts.
- Per-key and per-IP limits are counted in process memory. With several instances each keeps its own counters, so enforce the real limit at the edge.
- The per-IP throttle on key creation (and the per-IP rate limit) trusts `X-Forwarded-For` when `DELTAG_TRUST_PROXY` is on. If the platform in front of the server passes through a client-supplied header, callers can spoof their IP and dodge those throttles. Per-key limits are not affected.
- Key creation is open by default so anyone can try the API, and there is no email or captcha. That is a deliberate trade-off; set `BARET_KEY_ISSUANCE=closed` for a private deployment.
- A production server needs at least one static key (`DELTAG_API_KEYS`) or x402 enabled to start, even when key issuance is open.
- `GET /v1/audit/*` reflects only the current process (in memory, reset on restart), is **not separated per key**, and is visible to every valid key. Because keys are free, treat audit data as effectively public: entries include the `userWallet` and `integratorRequestId` values other callers sent.

### Auth modes

- **API key**, **x402**, or **both** may be configured. In **x402** or **both** modes, `/v1/analyze` may skip API key when x402 verification is used; exact rules follow server `DELTAG_AUTH_MODE` and `X402_*` environment variables.
- The showcase, the extension and `render.yaml` share one **public demo key** (`dev-key-change-me`). It is not a secret and is visible in the shipped bundles.

### Verdict attestation

- Signing is opt-in (`BARET_SIGNING_SECRET`). Only `@stellar-thorn/agent-guard` verifies it (`pinnedServerPublicKey`). The **extension and the showcase do not verify** verdicts, so a compromised server or proxy could still return a forged `safe:true` to them.

## Wallet extension (`apps/extension`)

### Sub-key spend caps (on-chain, with conditions)

Per-merchant sub-keys are registered on the smart wallet as Ed25519 signers scoped (`SignerLimits`) to one token contract and gated by the `MerchantSpendPolicy` contract, which enforces the merchant, per-transaction cap, sliding 24 h cap and mandate expiry on-chain
(`contracts/contracts/merchant-spend-policy`, wired in `apps/extension/src/background/swig/`). An older version of this document said caps were extension-only bookkeeping; that is no longer true. What remains true:

- **Provisioning is best-effort and happens after a manual approval** (the first one, the renewal of a lapsed mandate, or a retry when the merchant has no sub-key). If it fails (RPC error, passphrase no longer cached), that merchant keeps being paid with the wallet's admin key and has **no on-chain cap**, and the Activity tab says so; the extension's own bookkeeping still applies. Until a sub-key exists, a stolen extension profile is a stolen wallet.
- **Caps are fixed when the sub-key is provisioned.** Changing a merchant's caps in the extension does not update the on-chain allowance.
- **Renewing an expired mandate mints a new sub-key.** The on-chain allowance and the sub-key signer expire with the mandate (default 30 days), so re-approving replaces the sub-key; until the user re-approves, payments to that merchant prompt instead of auto-signing. This is covered by unit tests but has not been run against the live testnet.
- `Pause` is local only; `Revoke` removes the signer on-chain (`remove_signer`).
- The end-to-end live verification checklist in `contracts/contracts/merchant-spend-policy/DEPLOYMENT.md` was not re-run when this document was updated; the guarantee is established by the contract's unit tests and the code path.
- A leaked sub-key that is still valid is bounded by that one merchant's cap; a leaked **passphrase or root seed** is not bounded by anything.

### Lock and session behaviour

- MV3 service workers are suspended when idle. The decrypted key lives only in worker memory, so a suspended worker means the wallet is **locked again** and the user must re-enter the passphrase. Auto-lock is a fixed 15 minutes and is not user-configurable.
- To sign with sub-keys after an unlock, the passphrase stays in worker memory for **5 minutes**. After that, a sub-key that isn't already in the in-memory cache needs another unlock.

### x402 protections that are specified but not built

Facilitator `/supported` cross-check, amount-anomaly detection, settle-but-no-delivery and verify-orphan alerts, auto-revoke of idle sub-keys and `maxActiveSubKeys` exist as policy fields and editor toggles but nothing enforces them. See [`docs/policy-dsl.md`](./docs/policy-dsl.md) §1.4.
The post-sign monitor flags only **unknown outgoing transactions** (drift), by polling Horizon every 8 s.

### SEP-10 anchor logins

- The wallet recognises SEP-10 login challenges and blocks look-alikes (real sequence number, extra spend operations, a signature that isn't the anchor's `SIGNING_KEY`, a login for another account). Only `tr-mock-anchor.fly.dev` is on the built-in allowlist; a valid challenge from any other domain is a Caution ("unverified anchor"), and Baret never contacts an unlisted domain. The allowlist is not user-editable yet.
- This covers the login challenge only. Baret has no SEP-6 client and does not yet check a withdrawal's destination and memo against the anchor's instructions, so a withdrawal payment is judged by the normal analysis.
- A fee-bump envelope wrapping a challenge is not treated as a challenge; it goes to the normal analysis. The recognizer reads `stellar.toml` from the network, so a known anchor whose file is unreachable also shows the Caution.

### Analysis dependency

- The extension analyses via the hosted server (`https://baret-stellar.onrender.com` in packaged builds) with the public demo key. If it can't be reached the popup shows an "offline" advisory with a Retry button; signing anyway takes a deliberate 1.5 s press-and-hold, so it never allows silently or by one stray click. The hosted server sleeps when idle and the first request can take about 30 s, so the extension waits up to 45 s and pings `/health` when a site connects.
- The analyze server is advisory input, not the trust boundary: x402 caps and mandates are enforced locally.
- **Automatic x402 payments do not consult the analyzer.** Inside a live mandate they are approved from the extension's own caps and allow-lists and, once the sub-key exists, the on-chain policy, so they keep working while the server is down or asleep. The trade-off is that these payments get no server-side simulation.

### Distribution

- Not on the Chrome Web Store or AMO; installed unpacked (Chrome) or as a temporary add-on (Firefox ≥ 128, removed on browser restart).
- The keystore is mirrored in `storage.local` because Firefox temporary add-ons can lose IndexedDB on reload.

## Platform

- **Standalone wallet (`apps/wallet`):** the smart-wallet address is a placeholder (the authority account), the network is fixed to testnet, and it has no x402 mandates or sub-keys.
- **Showcase:** testnet only. Demo "danger" scenarios use real (testnet) attack transactions and a throw-away, publicly embedded demo issuer/drainer key.
- **Contracts:** `merchant-spend-policy` is deployed on testnet only. `payment-guard` is a superseded design kept for reference; its testnet deployment (v2) predates the current source (v3 was not redeployed).
