# Known limitations

This document describes what Baret does **not** yet guarantee — the HTTP
analyze API (DeltaG) below, and the wallet extension in the section that
follows.

## DeltaG server (HTTP API)

This section describes what the HTTP API does **not** guarantee and how to interpret results.

### Simulation vs on-chain execution

- The service uses Stellar **Soroban RPC `simulateTransaction`** (preflight) plus Horizon account state where configured. Results reflect **simulated** state, not guaranteed final execution outcomes.
- Network conditions, time-bound expiry, fee changes, and runtime differences can cause real execution to diverge from simulation.

### Transaction format

- Only **Stellar `TransactionEnvelope`** payloads are supported, provided as **base64 XDR** (`transactionXdr`).

### Account and instruction coverage

- The simulator passes a **bounded list** of account addresses to the RPC `accounts` field (see `MAX_SIMULATION_ACCOUNTS`, default 64). Accounts beyond that cap are **not** included in returned post-state; analysis may mark truncation and adjust confidence.
- Heuristics and policy rules operate on **observed** program IDs, token flows, and simulation logs. Unknown or novel program behavior may be under-detected.

### x402 settlement

- When x402 is enabled, payment is verified in a **pre-handler** before analysis runs. The server **validates the JSON response shape (Zod) before settlement**: if validation fails, the client receives an error and **settlement is not executed** (no payment finalization for that request).
- **Settlement** runs only after analyze completes and response schema validation succeeds, immediately before sending `200` with the validated body.
- If analysis throws, validation fails, or settlement fails, behavior differs: verified-but-not-settled payment state is possible on failures after verify; clients should treat facilitator/settlement errors (`FACILITATOR_ERROR`, HTTP 502) as distinct from policy outcomes (`safe` / `reasons`).

### Rate limiting

- The server may enforce per-IP rate limits (`DELTAG_RATE_LIMIT_MAX`, `DELTAG_RATE_LIMIT_WINDOW_MS`). Health endpoints are typically excluded. For multi-instance deployments, use a shared store or enforce limits at the edge (API gateway / CDN).

### RPC reliability

- Transient **timeouts** may trigger **one automatic retry** per RPC read/simulate/ping call. Repeated failures surface as `RPC_ERROR` / `RPC_TIMEOUT` (HTTP 502 / 504).

### Developer API keys

- Keys created with `POST /v1/keys` are stored as SHA-256 hashes in `keys.json` under `BARET_DATA_DIR`. **On hosts with an ephemeral disk (Render's free plan, containers without a volume) that file is wiped on every restart or spin-down**, so issued keys stop working and developers must create new ones. Mount a persistent disk/volume on `BARET_DATA_DIR` to keep them. `GET /v1/meta` reports `auth.keyIssuance.persistent`, but that only says the directory was writable, not that the disk survives restarts. Keys set in `DELTAG_API_KEYS` are read from the environment and are not affected.
- Per-key and per-IP limits are counted in process memory. With several instances each keeps its own counters, so enforce the real limit at the edge.
- The per-IP throttle on key creation (and the per-IP rate limit) trusts `X-Forwarded-For` when `DELTAG_TRUST_PROXY` is on. If the platform in front of the server passes through a client-supplied header, callers can spoof their IP and dodge those throttles. Per-key limits are not affected.
- Key creation is open by default so anyone can try the API, and there is no email or captcha. That is a deliberate trade-off; set `BARET_KEY_ISSUANCE=closed` for a private deployment (the `/developers` playground then needs a key from `DELTAG_API_KEYS`, which it cannot take yet).
- Keys from `DELTAG_API_KEYS` are limited per IP only: no per-key limit, no usage counters, no revocation through the API.
- `GET /v1/audit/*` reflects only the current process (in memory, reset on restart) and is visible to every valid key.

### Analysis coverage

- `KNOWN_MALICIOUS_ADDRESS` uses a small seed reputation list; it never blocks by itself (no policy option gates it), so absence of the finding is not evidence of safety.
- Several finding codes exist in the response type but are not emitted yet; `GET /v1/detectors?status=reserved` lists them.
- The MCP `baret_list_profiles` tool and the `policyProfile` argument describe policy profiles that are not applied to `/v1/analyze`; use the `policy` object instead.

### Auth modes

- **API key**, **x402**, or **both** may be configured. In **x402** or **both** modes, `/v1/analyze` may skip API key when x402 verification is used; exact rules follow server `DELTAG_AUTH_MODE` and `X402_*` environment variables.

## Wallet sub-keys (extension)

- **Per-merchant sub-key spend caps are enforced on-chain**, by the
  `MerchantSpendPolicy` Soroban contract
  (`contracts/contracts/merchant-spend-policy`, deployed to testnet — see
  its `DEPLOYMENT.md` for the current address). Each sub-key is registered
  as an `Ed25519` signer `SignerLimits`-scoped to one token contract,
  requiring `MerchantSpendPolicy`'s approval on every use; the policy binds
  each merchant's allowance to the ONE sub-key it was granted to, so a
  leaked sub-key cannot spend against a *different* merchant's cap on the
  same wallet. This replaced an earlier design that registered sub-keys via
  `add_signer(signer, { unlimited: true })` with no on-chain ceiling at all.
  The extension's own bookkeeping
  (`apps/extension/src/background/db/allowances.ts`) is still checked first
  (cheaper, no round-trip); the contract is the backstop that holds even if
  that bookkeeping is ever bypassed.
- **Not yet verified end-to-end in a live wallet.** The contract has its own
  unit test suite and the extension's wiring to it has unit coverage
  (mocked, no network calls) as of PR #19, but nobody has yet provisioned a
  real smart wallet, approved a merchant, and confirmed on-chain that an
  over-cap or wrong-signer payment is actually rejected against the
  currently deployed instance. Treat the guarantee as "built and tested in
  isolation," not "proven live," until that check is done.
- See the SECURITY NOTE in `apps/extension/src/background/swig/sub-keys.ts`,
  `docs/x402-defense.md` §10, and
  `contracts/contracts/merchant-spend-policy/DEPLOYMENT.md`'s
  "End-to-end verification" checklist for what that live check involves.
