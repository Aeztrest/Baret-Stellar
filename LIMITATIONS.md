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

### Auth modes

- **API key**, **x402**, or **both** may be configured. In **x402** or **both** modes, `/v1/analyze` may skip API key when x402 verification is used; exact rules follow server `DELTAG_AUTH_MODE` and `X402_*` environment variables.

## Wallet sub-keys (extension)

- **Per-merchant sub-key spend caps are not enforced on-chain.** The extension
  registers each per-merchant sub-key on the smart-wallet contract via
  `add_signer(signer, { unlimited: true })` — the deployed contract has no
  per-signer spending-cap enforcement today. The per-tx/hour/day caps you see
  in the UI are enforced entirely by this extension's own bookkeeping
  (`apps/extension/src/background/db/allowances.ts`).
- **Practical consequence:** if a sub-key's encrypted secret is ever
  exfiltrated and decrypted outside the extension, the attacker can sign an
  arbitrary transfer against the smart wallet with no on-chain ceiling — not
  capped to "this merchant's remaining allowance." Revoking a sub-key
  on-chain (`remove_signer`) still works and is the correct incident
  response, but the cap itself is not chain-enforced in normal operation.
- See the SECURITY NOTE in `apps/extension/src/background/swig/sub-keys.ts`
  and the integration roadmap in `docs/x402-defense.md` §10 for the plan to
  close this gap by routing sub-key spend through the already-deployed
  `PaymentGuard` contract.
