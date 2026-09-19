/**
 * The endpoint reference shown in the developer portal.
 *
 * Written by hand for readability, checked against the server: a test in
 * `apps/server/test/api/portal-catalog.test.ts` fails if a `method` + `path`
 * listed here is not in the served OpenAPI document, or if a documented route
 * is missing from here. The example responses are real output from a running
 * server (long values shortened).
 */

export type Param = { name: string; type: string; required?: boolean; description: string };

export type Group = "Analysis" | "Reference" | "Keys" | "Agents (MCP)" | "Audit" | "Health";

export type Endpoint = {
  group: Group;
  method: "GET" | "POST" | "DELETE";
  path: string;
  auth: "key" | "none";
  summary: string;
  description: string;
  body?: Param[];
  query?: Param[];
  requestExample?: unknown;
  status?: number;
  responseExample?: unknown;
  /** Error codes this endpoint can return, beyond the universal ones. */
  errors?: string[];
  notes?: string[];
  /** Safe to run from the page with one click (no body needed). */
  runnable?: boolean;
};

const XDR = "AAAAAgAAAACdI4y7…AAAAAA==";
const ADDR = "GAT3XUNP4TB6SQCK7XJW2R4F5ADLYUQH4PP37TVIQ3XGB3RVMXOJ3CTQ";

const analyzeBody: Param[] = [
  { name: "network", type: "\"testnet\" | \"pubnet\"", required: true, description: "Must match the server's network (see GET /v1/meta)." },
  { name: "transactionXdr", type: "string", required: true, description: "Base64 TransactionEnvelope XDR. Signed or unsigned. Fee-bump envelopes are analysed via their inner transaction." },
  { name: "policy", type: "object", description: "Your rules. Every field is optional. See Policy options below." },
  { name: "userWallet", type: "string (G…)", description: "The account whose balances to evaluate. Required by maxLossPercent and minPostUsdcBalance." },
  { name: "integratorRequestId", type: "string", description: "Your own correlation id (max 256 chars), echoed back in meta." },
  { name: "paymentRequirements", type: "object", description: "For x402 payments: the merchant's published requirements, to check the transaction against." },
];

export const ENDPOINTS: Endpoint[] = [
  /* ───────────── Analysis ───────────── */
  {
    group: "Analysis",
    method: "POST",
    path: "/v1/analyze",
    auth: "key",
    summary: "Analyze a transaction before anyone signs it",
    description:
      "The core call. Baret decodes the transaction, reads account state from Horizon, runs Soroban preflight when there is a contract call, works out the balance changes, runs the risk detectors, then applies your policy. `safe` is false when the policy blocks it. Analysis is a simulation against current chain state, not a guarantee of on-chain execution.",
    body: analyzeBody,
    requestExample: {
      network: "testnet",
      transactionXdr: XDR,
      userWallet: ADDR,
      policy: { maxLossPercent: 50, blockAccountMerge: true, blockSignerChanges: true, blockMasterKeyRemoval: true },
    },
    status: 200,
    responseExample: {
      safe: false,
      reasons: [
        "Signer / threshold change detected and blocked by policy",
        "Master-key removal detected and blocked by policy",
      ],
      estimatedChanges: { native: [], assets: [], trustlines: [], allowances: [] },
      riskFindings: [
        {
          code: "MASTER_KEY_REMOVED",
          severity: "high",
          message: `Sets the master key weight of ${ADDR.slice(0, 8)}… to 0: the account's own key can no longer sign for it.`,
          details: { operationIndex: 0, account: `${ADDR.slice(0, 8)}…` },
        },
        {
          code: "SIGNER_CHANGE_DETECTED",
          severity: "high",
          message: "Adds or updates a signer on GAT3XUNP…with weight 255: GCX7… could sign for this account.",
        },
      ],
      simulationWarnings: [],
      annotation: {
        summary: {
          humanReadable: "setOptions(master=0, signer±)",
          primaryAction: "set_options",
          involvedContracts: [],
          involvedAssets: [],
        },
        cpiTrace: { roots: [], allContractAddresses: [], maxDepth: 0, totalInvocations: 0, truncated: false },
      },
      meta: { analysisVersion: "v1", network: "testnet", simulatedAt: "2026-09-19T18:07:57.765Z", confidence: "medium" },
    },
    errors: ["WRONG_NETWORK", "RPC_ERROR"],
    notes: [
      "`confidence` is `medium` for classic (non-Soroban) transactions because there is no preflight to run; `low` when data was incomplete or a simulation failed.",
      "A finding with no matching policy option is advisory: it is reported but does not change `safe`.",
      "With x402 enabled on the server you can pay per call instead of using a key: you get HTTP 402 with a PAYMENT-REQUIRED header.",
    ],
  },
  {
    group: "Analysis",
    method: "POST",
    path: "/v1/analyze/batch",
    auth: "key",
    summary: "Analyze up to 25 transactions in one call",
    description:
      "Items run independently and in parallel. One failing item does not fail the request: read each result's `status`. A batch counts as one request per item against your key's per-minute limit.",
    body: [{ name: "transactions", type: "AnalyzeRequest[]", required: true, description: "1–25 objects, each the same shape as the /v1/analyze body." }],
    requestExample: { transactions: [{ network: "testnet", transactionXdr: XDR, userWallet: ADDR, policy: {} }] },
    status: 200,
    responseExample: {
      count: 2,
      results: [
        { index: 0, status: "success", decision: { safe: true, reasons: [], riskFindings: [], "…": "same as /v1/analyze" } },
        { index: 1, status: "error", error: { code: "WRONG_NETWORK", message: "Server is configured for testnet, request asked for pubnet" } },
      ],
      summary: { safe: 1, blocked: 0, errors: 1 },
    },
  },
  {
    group: "Analysis",
    method: "POST",
    path: "/v1/analyze/stream",
    auth: "key",
    summary: "Same as batch, streamed as results finish",
    description:
      "Server-sent events: `start`, then one `result` per transaction (in order, analysed one after another), then `complete`. Read it with fetch and a stream reader: the browser's EventSource cannot POST.",
    body: [{ name: "transactions", type: "AnalyzeRequest[]", required: true, description: "1–25 objects, same shape as batch." }],
    requestExample: { transactions: [{ network: "testnet", transactionXdr: XDR }] },
    status: 200,
    responseExample: "event: start\ndata: {\"total\":1}\n\nevent: result\ndata: {\"index\":0,\"status\":\"success\",\"decision\":{…}}\n\nevent: complete\ndata: {\"total\":1}",
  },
  {
    group: "Analysis",
    method: "POST",
    path: "/v1/decode",
    auth: "key",
    summary: "Explain a transaction without simulating it",
    description:
      "No network calls, so it is fast and cheap. Returns the operations in plain language, memo, time bounds, hash and the Soroban auth tree. It says nothing about risk: use it to render a transaction, or to decide whether a full analysis is worth running.",
    body: [
      { name: "network", type: "\"testnet\" | \"pubnet\"", required: true, description: "Must match the server's network." },
      { name: "transactionXdr", type: "string", required: true, description: "Base64 TransactionEnvelope XDR." },
    ],
    requestExample: { network: "testnet", transactionXdr: XDR },
    status: 200,
    responseExample: {
      hash: "74ed908832bbd23100c2ea12e0a2b122254b6632026d2df7a0f8eabd39d53b1e",
      network: "testnet",
      kind: "transaction",
      source: ADDR,
      fee: "100",
      sequence: "1",
      memo: { type: "none", value: null },
      timeBounds: { minTime: "0", maxTime: "1789839000" },
      signatureCount: 0,
      summary: {
        operations: [
          { index: 0, type: "payment", source: null, action: "payment", description: "Payment 25.0000000 XLM → GD3ZQS…53FX", details: { asset: "native", amount: "25.0000000" } },
        ],
        humanReadable: "Payment 25.0000000 XLM → GD3ZQS…53FX",
        primaryAction: "payment",
        involvedContracts: [],
        involvedAssets: ["native"],
      },
      cpiTrace: { roots: [], allContractAddresses: [], maxDepth: 0, totalInvocations: 0, truncated: false },
    },
    errors: ["WRONG_NETWORK"],
  },
  {
    group: "Analysis",
    method: "POST",
    path: "/v1/replay",
    auth: "key",
    summary: "Re-run the raw simulation",
    description:
      "Returns the normalized simulation with no risk assessment. Stellar cannot simulate against a past ledger, so this always runs against current state: `isHistorical` is always false and `ledger` is only echoed back.",
    body: [
      { name: "network", type: "\"testnet\" | \"pubnet\"", required: true, description: "Must match the server's network." },
      { name: "transactionXdr", type: "string", required: true, description: "Base64 TransactionEnvelope XDR." },
      { name: "ledger", type: "integer", description: "Informational only." },
    ],
    requestExample: { network: "testnet", transactionXdr: XDR },
    status: 200,
    responseExample: { simulation: { status: "success", err: null, preflighted: false, "…": "accounts, authEntries, events, fees" }, replayLedger: null, replayedAt: "2026-09-19T18:08:01.120Z", isHistorical: false },
    errors: ["WRONG_NETWORK", "RPC_ERROR"],
  },

  /* ───────────── Reference ───────────── */
  {
    group: "Reference",
    method: "GET",
    path: "/v1/meta",
    auth: "none",
    summary: "Server capabilities and limits",
    description: "Which network this server runs, how to authenticate, rate limits, x402 pricing and the attestation public key. No key needed: read it first when you integrate.",
    status: 200,
    responseExample: {
      name: "Baret API",
      version: "1.0.0",
      network: { name: "testnet", passphrase: "Test SDF Network ; September 2015" },
      usdc: { code: "USDC", issuer: "GBBD47IF…LFLA5", contract: "CBIELTK6…XMQDAMA" },
      auth: { modes: ["api_key"], header: "Authorization: Bearer <key>  (or  X-API-Key: <key>)", keyIssuance: { enabled: true, endpoint: "POST /v1/keys", persistent: true } },
      limits: { maxBodyBytes: 1048576, maxBatchSize: 25, maxSimulationOperations: 20, requestTimeoutMs: 15000, rateLimit: { perKeyPerMinute: 60, perIp: { max: 200, windowMs: 60000 } } },
      x402: { enabled: false },
      attestation: { enabled: false, signerPublicKey: null },
    },
    runnable: true,
  },
  {
    group: "Reference",
    method: "GET",
    path: "/v1/detectors",
    auth: "none",
    summary: "Every risk finding code, explained",
    description: "The catalog behind `riskFindings[].code`: category, severities, meaning and the policy option that makes each one blocking. `status: reserved` codes exist in the type but nothing emits them yet.",
    query: [
      { name: "status", type: "\"active\" | \"reserved\"", description: "Only detectors in this state." },
      { name: "category", type: "string", description: "account, allowance, auth-tree, balance, contracts, fees, simulation, trustline, x402." },
    ],
    status: 200,
    responseExample: {
      count: 32,
      detectors: [
        { code: "ACCOUNT_MERGE_DETECTED", category: "account", title: "Account merge", description: "An AccountMerge operation moves an account's entire XLM balance…", severities: ["high"], status: "active", policyFlag: "blockAccountMerge" },
      ],
    },
    runnable: true,
  },
  {
    group: "Reference",
    method: "GET",
    path: "/v1/policy/schema",
    auth: "none",
    summary: "Policy options and ready-made presets",
    description: "Every option `policy` understands, with caveats, plus Strict / Balanced / Permissive presets you can send as-is.",
    status: 200,
    responseExample: {
      options: [{ name: "blockAccountMerge", type: "boolean", description: "Block AccountMerge operations…", relatedFindings: ["ACCOUNT_MERGE_DETECTED"] }],
      presets: [{ id: "balanced", name: "Balanced", description: "Production default…", policy: { maxLossPercent: 50, blockAccountMerge: true } }],
      notes: ["Every option is optional. An empty policy `{}` blocks only failed Soroban simulations and incomplete data."],
    },
    runnable: true,
  },

  /* ───────────── Keys ───────────── */
  {
    group: "Keys",
    method: "POST",
    path: "/v1/keys",
    auth: "none",
    summary: "Create a free API key",
    description: "Instant, no account. The key is returned once and only its hash is stored. Limited per IP address. Returns 403 when the operator has turned self-service keys off.",
    body: [{ name: "name", type: "string", required: true, description: "A label for you (1–64 characters)." }],
    requestExample: { name: "my-wallet-backend" },
    status: 201,
    responseExample: {
      key: "baret_k3J9x…",
      id: "key_4d8a8dd069b28546",
      prefix: "baret_k3J9",
      name: "my-wallet-backend",
      createdAt: "2026-09-19T17:57:34.218Z",
      rateLimitPerMin: 60,
      message: "Store this key now — it cannot be shown again.",
    },
    errors: ["FORBIDDEN", "RATE_LIMITED", "UNAVAILABLE"],
  },
  {
    group: "Keys",
    method: "GET",
    path: "/v1/keys/me",
    auth: "key",
    summary: "See your key and its usage",
    description: "Metadata and request counts for the key that made the call.",
    status: 200,
    responseExample: {
      source: "issued",
      id: "key_4d8a8dd069b28546",
      prefix: "baret_k3J9",
      name: "my-wallet-backend",
      createdAt: "2026-09-19T17:57:34.218Z",
      lastUsedAt: "2026-09-19T18:07:58.001Z",
      rateLimitPerMin: 60,
      usage: { total: 12, today: 12, last7Days: [{ date: "2026-09-19", count: 12 }], byEndpoint: { "POST /v1/analyze": 10, "GET /v1/keys/me": 2 } },
    },
    runnable: true,
  },
  {
    group: "Keys",
    method: "DELETE",
    path: "/v1/keys/me",
    auth: "key",
    summary: "Revoke your key",
    description: "Permanently disables the key that made the call. Do this if a key leaks.",
    status: 200,
    responseExample: { revoked: true, id: "key_4d8a8dd069b28546" },
  },

  /* ───────────── Agents ───────────── */
  {
    group: "Agents (MCP)",
    method: "GET",
    path: "/mcp/tools",
    auth: "key",
    summary: "List the tools an AI agent can call",
    description: "Tool descriptors with JSON-Schema inputs.",
    status: 200,
    responseExample: { tools: [{ name: "baret_analyze", description: "Analyze a Stellar transaction…", inputSchema: { type: "object", properties: { transactionXdr: { type: "string" } }, required: ["transactionXdr"] } }] },
    runnable: true,
  },
  {
    group: "Agents (MCP)",
    method: "POST",
    path: "/mcp/call",
    auth: "key",
    summary: "Call a tool",
    description: "`baret_analyze` returns a Markdown summary of the verdict written for an LLM to read; `baret_health` reports the server's network. Tool failures return 422 with `isError: true`.",
    body: [
      { name: "tool", type: "string", required: true, description: "baret_analyze or baret_health." },
      { name: "arguments", type: "object", description: "Tool arguments, e.g. { transactionXdr, network, userWallet }." },
    ],
    requestExample: { tool: "baret_analyze", arguments: { transactionXdr: XDR, network: "testnet" } },
    status: 200,
    responseExample: { content: [{ type: "text", text: "## Transaction Analysis Result\n**Verdict**: SAFE\n…" }] },
    notes: ["Building an agent that signs? The @stellar-thorn/agent-guard SDK wraps this whole flow."],
  },

  /* ───────────── Audit ───────────── */
  {
    group: "Audit",
    method: "GET",
    path: "/v1/audit/recent",
    auth: "key",
    summary: "Most recent verdicts this server produced",
    description: "An in-memory log (newest first, capped at 10,000, reset on restart). It holds verdicts and addresses, never transaction XDR.",
    query: [{ name: "limit", type: "integer", description: "1–200, default 50." }],
    status: 200,
    responseExample: { entries: [{ id: "8f0c…", timestamp: "2026-09-19T18:07:57.765Z", network: "testnet", safe: false, confidence: "medium", riskCodes: ["MASTER_KEY_REMOVED", "SIGNER_CHANGE_DETECTED"], contractAddresses: [], primaryAction: "set_options", userWallet: ADDR, durationMs: 412 }] },
    runnable: true,
  },
  {
    group: "Audit",
    method: "GET",
    path: "/v1/audit/aggregate",
    auth: "key",
    summary: "Totals and the most common risks",
    description: "Counts of safe vs blocked verdicts and the top risk codes and blocked contracts.",
    query: [{ name: "since", type: "ISO 8601 date", description: "Only count analyses at or after this time." }],
    status: 200,
    responseExample: { totalAnalyses: 4, safeCount: 1, blockedCount: 3, topRiskCodes: [{ code: "MASTER_KEY_REMOVED", count: 2 }], topBlockedContracts: [], timeRange: { from: "2026-09-19T17:58:01.000Z", to: "2026-09-19T18:08:01.000Z" } },
    runnable: true,
  },
  {
    group: "Audit",
    method: "GET",
    path: "/v1/audit/contract/{contractAddress}",
    auth: "key",
    summary: "What this server has seen for one contract",
    description: "Stats (null if never seen) and recent entries for a Soroban contract address.",
    query: [{ name: "limit", type: "integer", description: "1–200, default 50." }],
    status: 200,
    responseExample: { contractAddress: "CBIELTK6…XMQDAMA", stats: { totalSeen: 3, blockedCount: 1, riskCodes: { SOROBAN_ALLOWANCE_GRANTED: 1 }, lastSeen: "2026-09-19T18:00:00.000Z" }, recentEntries: [] },
  },

  /* ───────────── Health ───────────── */
  {
    group: "Health",
    method: "GET",
    path: "/health",
    auth: "none",
    summary: "Liveness",
    description: "Answers as long as the process is up. Not rate limited.",
    status: 200,
    responseExample: { status: "ok" },
    runnable: true,
  },
  {
    group: "Health",
    method: "GET",
    path: "/health/ready",
    auth: "none",
    summary: "Readiness",
    description: "Checks the Stellar RPC (and the x402 facilitator when enabled). Returns 503 with `status: degraded` when something is failing.",
    status: 200,
    responseExample: { status: "ready", checks: { testnet: { ok: true } } },
    runnable: true,
  },
];

export const GROUPS: Group[] = ["Analysis", "Reference", "Keys", "Agents (MCP)", "Audit", "Health"];

/** What every error code means and what to do about it. Mirrors the server's ApiErrorCode. */
export const ERROR_CODES: Array<{ code: string; status: string; meaning: string; action: string }> = [
  { code: "BAD_REQUEST", status: "400", meaning: "The request is malformed, has an invalid field, or the XDR can't be decoded.", action: "Fix the request. `details.issues` lists the offending fields." },
  { code: "WRONG_NETWORK", status: "400", meaning: "Your transaction targets a different Stellar network than this server runs.", action: "Check `GET /v1/meta` and build the transaction for that network." },
  { code: "UNAUTHORIZED", status: "401", meaning: "Missing, invalid or revoked API key.", action: "Send `Authorization: Bearer <key>`, or create a key with `POST /v1/keys`." },
  { code: "FORBIDDEN", status: "403", meaning: "The operator disabled this action (for example self-service keys).", action: "Ask the server's operator." },
  { code: "NOT_FOUND", status: "404", meaning: "No such route.", action: "Check the path against the reference." },
  { code: "PAYLOAD_TOO_LARGE", status: "413", meaning: "The body is bigger than the server accepts.", action: "Send less data; see `limits.maxBodyBytes` in `/v1/meta`." },
  { code: "RATE_LIMITED", status: "429", meaning: "Too many requests for your key (or from your IP).", action: "Wait `Retry-After` seconds. Batches cost one request per item." },
  { code: "INTERNAL_ERROR", status: "500", meaning: "Something unexpected failed on the server.", action: "Retry once. If it persists, report the `X-Request-Id` header." },
  { code: "RPC_ERROR", status: "502 / 504", meaning: "Stellar's public network was unavailable (502) or slow (504).", action: "Safe to retry with a short backoff." },
  { code: "FACILITATOR_ERROR", status: "502", meaning: "The x402 payment facilitator failed. Only when paying per request.", action: "Retry; your payment is settled only after a successful analysis." },
  { code: "UNAVAILABLE", status: "503", meaning: "The server can't do this right now (for example it is not issuing keys).", action: "Try again later." },
];
