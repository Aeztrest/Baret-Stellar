import type { AppConfig } from "../config/index.js";
import { API_ERROR_CODES } from "./errors.js";
import { DETECTOR_CATALOG } from "../domain/detector-catalog.js";
import { POLICY_OPTIONS } from "./policy-schema.js";

/**
 * The OpenAPI 3.0 description served at `GET /openapi.json`.
 *
 * Hand-written on purpose: request validation lives in zod and responses are
 * shaped by the analysis pipeline, so there is no single schema to generate
 * from. `openapi.test.ts` keeps this honest — every registered route must be
 * documented here, and the error codes come straight from `API_ERROR_CODES`.
 */

type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const resp = (name: string): Schema => ({ $ref: `#/components/responses/${name}` });
const arrayOf = (items: Schema): Schema => ({ type: "array", items });
const str = (description?: string, extra: Schema = {}): Schema => ({
  type: "string",
  ...(description ? { description } : {}),
  ...extra,
});
const int = (description?: string): Schema => ({
  type: "integer",
  ...(description ? { description } : {}),
});
const bool = (description?: string): Schema => ({
  type: "boolean",
  ...(description ? { description } : {}),
});
const obj = (properties: Record<string, Schema>, required: string[] = [], extra: Schema = {}): Schema => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  ...extra,
});
const json = (schema: Schema, example?: unknown): Schema => ({
  "application/json": { schema, ...(example !== undefined ? { example } : {}) },
});

const NETWORK = { type: "string", enum: ["testnet", "pubnet"] };
const G_ADDRESS = { type: "string", pattern: "^G[A-Z2-7]{55}$", example: "GA7QYNF7SOWQ3GLR2BGMZEHSCT5Y5LA4D2YUTH6P5N2C4V3UNUNH7YBM" };

const publicOp = { security: [] as unknown[] };

export function buildOpenApi(opts: { serverUrl: string; config: AppConfig }): Schema {
  const { serverUrl, config } = opts;

  const policyProperties: Record<string, Schema> = {};
  for (const o of POLICY_OPTIONS) {
    policyProperties[o.name] = {
      type: o.type === "string[]" ? "array" : o.type,
      ...(o.type === "string[]" ? { items: { type: "string" } } : {}),
      ...(o.name === "maxLossPercent" ? { minimum: 0, maximum: 100 } : {}),
      ...(o.default !== undefined ? { default: o.default } : {}),
      description: o.caveat ? `${o.description} ${o.caveat}` : o.description,
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "Baret API",
      version: "1.0.0",
      description: [
        "Pre-sign transaction analysis for Stellar. Send an unsigned transaction envelope, get back a verdict, the balance changes it would cause, and the risks it carries — before any key signs it.",
        "",
        "**Authentication.** Every `/v1` route except discovery (`/v1/meta`, `/v1/detectors`, `/v1/policy/schema`) and key creation needs a key: `Authorization: Bearer <key>` or `X-API-Key: <key>`. Create a free key with `POST /v1/keys`.",
        "",
        `**Network.** This server analyses **${config.stellar.network}** only. Requests for the other network get \`WRONG_NETWORK\`.`,
        "",
        "**Errors.** Every error is `{ \"error\": { \"code\", \"message\", \"details?\" } }`. Switch on `code`; `message` is for humans. Responses carry `X-Request-Id` — include it when reporting a problem.",
        "",
        "**Simulated, not guaranteed.** Results describe a simulation against current chain state. On-chain execution can differ (see `LIMITATIONS.md`).",
      ].join("\n"),
      license: { name: "MIT" },
    },
    servers: [{ url: serverUrl, description: `Baret API (${config.stellar.network})` }],
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
    tags: [
      { name: "Analysis", description: "Simulate and assess transactions." },
      { name: "Reference", description: "Public catalogs: detectors, policy options, server limits." },
      { name: "Keys", description: "Create and manage your API key." },
      { name: "Agents (MCP)", description: "Tool-call interface for AI agents." },
      { name: "Audit", description: "What this server has analysed recently." },
      { name: "Health", description: "Liveness and readiness." },
    ],
    paths: {
      "/v1/analyze": {
        post: {
          tags: ["Analysis"],
          operationId: "analyzeTransaction",
          summary: "Analyze a transaction",
          description:
            "Decodes the envelope, fetches account state from Horizon, runs Soroban preflight when needed, computes balance changes, runs the risk detectors, then applies your `policy`. `safe` is false when the policy blocks the transaction.\n\nPass `userWallet` to have balance changes and balance-based rules (`maxLossPercent`, `minPostUsdcBalance`) evaluated for that account.\n\nWhen the server has x402 enabled, callers without a key may pay per request instead: the server answers `402` with a `PAYMENT-REQUIRED` header.",
          requestBody: { required: true, content: json(ref("AnalyzeRequest")) },
          responses: {
            "200": { description: "Verdict and analysis.", content: json(ref("AnalyzeResponse")) },
            "400": resp("BadRequest"),
            "401": resp("Unauthorized"),
            "402": { description: "Payment required (only when x402 is enabled and no key was sent). Body and headers follow the x402 protocol." },
            "429": resp("RateLimited"),
            "502": resp("RpcError"),
            "504": resp("RpcError"),
            "500": resp("InternalError"),
          },
        },
      },
      "/v1/analyze/batch": {
        post: {
          tags: ["Analysis"],
          operationId: "analyzeBatch",
          summary: "Analyze up to 25 transactions",
          description:
            "Runs each item independently and in parallel. One failing item does not fail the request: check each result's `status`. Counts as one request **per item** against your key's per-minute limit.",
          requestBody: { required: true, content: json(ref("BatchRequest")) },
          responses: {
            "200": { description: "One result per submitted transaction, in order.", content: json(ref("BatchResponse")) },
            "400": resp("BadRequest"),
            "401": resp("Unauthorized"),
            "429": resp("RateLimited"),
            "500": resp("InternalError"),
          },
        },
      },
      "/v1/analyze/stream": {
        post: {
          tags: ["Analysis"],
          operationId: "analyzeStream",
          summary: "Analyze a batch as a server-sent event stream",
          description:
            "Same input as the batch endpoint, but results arrive one at a time as they finish: `start`, then one `result` per transaction in order, then `complete`. Read it with `fetch` and a stream reader (browser `EventSource` cannot POST). Items are analysed sequentially.",
          requestBody: { required: true, content: json(ref("BatchRequest")) },
          responses: {
            "200": {
              description: "`text/event-stream`. Events: `start` {total}, `result` {index, status, decision | error}, `complete` {total}.",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
            "400": resp("BadRequest"),
            "401": resp("Unauthorized"),
            "429": resp("RateLimited"),
          },
        },
      },
      "/v1/decode": {
        post: {
          tags: ["Analysis"],
          operationId: "decodeTransaction",
          summary: "Decode a transaction without simulating it",
          description:
            "Explains what a transaction contains — operations in plain language, memo, time bounds, hash, Soroban auth tree — with no RPC calls. Fast and cheap; use it to render a transaction before (or instead of) a full analysis. It says nothing about risk.",
          requestBody: { required: true, content: json(ref("DecodeRequest")) },
          responses: {
            "200": { description: "Decoded transaction.", content: json(ref("DecodeResponse")) },
            "400": resp("BadRequest"),
            "401": resp("Unauthorized"),
            "429": resp("RateLimited"),
          },
        },
      },
      "/v1/replay": {
        post: {
          tags: ["Analysis"],
          operationId: "replaySimulation",
          summary: "Re-run the raw simulation",
          description:
            "Returns the normalized simulation (no risk assessment). Stellar cannot simulate against a past ledger, so this always runs against current state: `isHistorical` is always false and `ledger` is echoed back informationally.",
          requestBody: { required: true, content: json(ref("ReplayRequest")) },
          responses: {
            "200": { description: "Normalized simulation.", content: json(ref("ReplayResponse")) },
            "400": resp("BadRequest"),
            "401": resp("Unauthorized"),
            "429": resp("RateLimited"),
            "502": resp("RpcError"),
            "504": resp("RpcError"),
            "500": resp("InternalError"),
          },
        },
      },
      "/v1/meta": {
        get: {
          ...publicOp,
          tags: ["Reference"],
          operationId: "getMeta",
          summary: "Server capabilities and limits",
          description: "Which network this server runs, how to authenticate, rate limits, x402 pricing, and the attestation public key. No key needed.",
          responses: { "200": { description: "Server metadata.", content: json(ref("Meta")) } },
        },
      },
      "/v1/detectors": {
        get: {
          ...publicOp,
          tags: ["Reference"],
          operationId: "listDetectors",
          summary: "Catalog of risk finding codes",
          description: "Every `riskFindings[].code` this API can return, with severity, meaning and the policy option that makes it blocking. `status: reserved` codes exist in the type but are not emitted yet. No key needed.",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["active", "reserved"] } },
            { name: "category", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Detector catalog.", content: json(ref("DetectorList")) } },
        },
      },
      "/v1/policy/schema": {
        get: {
          ...publicOp,
          tags: ["Reference"],
          operationId: "getPolicySchema",
          summary: "Policy options and ready-made presets",
          description: "Every option the `policy` object understands, plus Strict / Balanced / Permissive presets you can send as-is. No key needed.",
          responses: { "200": { description: "Policy reference.", content: json(ref("PolicySchema")) } },
        },
      },
      "/v1/keys": {
        post: {
          ...publicOp,
          tags: ["Keys"],
          operationId: "createKey",
          summary: "Create an API key",
          description: "Free, instant, no account. The key is shown **once** — only a hash is stored. Limited per IP address. Returns `403` when the operator has disabled self-service keys.",
          requestBody: { required: true, content: json(obj({ name: str("What this key is for (1–64 characters).", { example: "my-wallet-backend", minLength: 1, maxLength: 64 }) }, ["name"])) },
          responses: {
            "201": { description: "Key created.", content: json(ref("KeyCreated")) },
            "400": resp("BadRequest"),
            "403": resp("Forbidden"),
            "429": resp("RateLimited"),
            "503": { description: "The server is not issuing keys right now.", content: json(ref("Error")) },
          },
        },
      },
      "/v1/keys/me": {
        get: {
          tags: ["Keys"],
          operationId: "getMyKey",
          summary: "Inspect your key and its usage",
          description: "Returns metadata and request counts for the key used to make this call.",
          responses: {
            "200": { description: "Key details.", content: json(ref("KeyInfo")) },
            "401": resp("Unauthorized"),
          },
        },
        delete: {
          tags: ["Keys"],
          operationId: "revokeMyKey",
          summary: "Revoke your key",
          description: "Permanently disables the key used to make this call. Use it if a key leaks. Keys configured by the server operator cannot be revoked here.",
          responses: {
            "200": { description: "Key revoked.", content: json(obj({ revoked: bool(), id: str() }, ["revoked", "id"])) },
            "400": resp("BadRequest"),
            "401": resp("Unauthorized"),
          },
        },
      },
      "/v1/audit/recent": {
        get: {
          tags: ["Audit"],
          operationId: "auditRecent",
          summary: "Most recent analyses",
          description: "In-memory log of verdicts this server process produced (newest first, capped at 10,000, reset on restart). Contains no transaction XDR.",
          parameters: [{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } }],
          responses: {
            "200": { description: "Recent audit entries.", content: json(obj({ entries: arrayOf(ref("AuditEntry")) }, ["entries"])) },
            "401": resp("Unauthorized"),
            "429": resp("RateLimited"),
          },
        },
      },
      "/v1/audit/aggregate": {
        get: {
          tags: ["Audit"],
          operationId: "auditAggregate",
          summary: "Verdict totals and top risks",
          parameters: [{ name: "since", in: "query", description: "ISO 8601 timestamp; only count analyses at or after it.", schema: { type: "string", format: "date-time" } }],
          responses: {
            "200": { description: "Aggregate statistics.", content: json(ref("AuditAggregate")) },
            "401": resp("Unauthorized"),
            "429": resp("RateLimited"),
          },
        },
      },
      "/v1/audit/contract/{contractAddress}": {
        get: {
          tags: ["Audit"],
          operationId: "auditContract",
          summary: "What this server has seen for one contract",
          parameters: [
            { name: "contractAddress", in: "path", required: true, schema: { type: "string", pattern: "^C[A-Z2-7]{55}$" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
          ],
          responses: {
            "200": { description: "Stats (null if never seen) and recent entries.", content: json(ref("AuditContract")) },
            "401": resp("Unauthorized"),
            "429": resp("RateLimited"),
          },
        },
      },
      "/mcp/tools": {
        get: {
          tags: ["Agents (MCP)"],
          operationId: "mcpListTools",
          summary: "List agent tools",
          description: "Tool descriptors (name, description, JSON-Schema input) an AI agent can call through `POST /mcp/call`.",
          responses: {
            "200": { description: "Tool list.", content: json(obj({ tools: arrayOf(obj({ name: str(), description: str(), inputSchema: obj({}) }, ["name", "description", "inputSchema"])) }, ["tools"])) },
            "401": resp("Unauthorized"),
          },
        },
      },
      "/mcp/call": {
        post: {
          tags: ["Agents (MCP)"],
          operationId: "mcpCallTool",
          summary: "Call an agent tool",
          description: "`baret_analyze` returns a Markdown summary of the verdict written for an LLM to read; `baret_health` reports the server's network. Tool failures return `422` with `isError: true`.",
          requestBody: {
            required: true,
            content: json(
              obj({ tool: str("Tool name.", { example: "baret_analyze" }), arguments: obj({}, [], { description: "Tool arguments, e.g. `{ transactionXdr, network, userWallet }`." }) }, ["tool"]),
            ),
          },
          responses: {
            "200": { description: "Tool result.", content: json(ref("McpResult")) },
            "400": resp("BadRequest"),
            "401": resp("Unauthorized"),
            "422": { description: "The tool ran and reported an error.", content: json(ref("McpResult")) },
          },
        },
      },
      "/health": {
        get: {
          ...publicOp,
          tags: ["Health"],
          operationId: "health",
          summary: "Liveness",
          responses: { "200": { description: "The process is up.", content: json(obj({ status: str(undefined, { example: "ok" }) }, ["status"])) } },
        },
      },
      "/health/ready": {
        get: {
          ...publicOp,
          tags: ["Health"],
          operationId: "healthReady",
          summary: "Readiness (Stellar RPC and, if enabled, the x402 facilitator)",
          responses: {
            "200": { description: "All checks passed.", content: json(ref("Ready")) },
            "503": { description: "A dependency is failing.", content: json(ref("Ready")) },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "`Authorization: Bearer <key>`" },
        apiKeyHeader: { type: "apiKey", in: "header", name: "X-API-Key", description: "`X-API-Key: <key>` — equivalent to the bearer form." },
      },
      responses: {
        BadRequest: { description: "The request is malformed or refers to a different network.", content: json(ref("Error")) },
        Unauthorized: { description: "Missing, invalid or revoked API key.", content: json(ref("Error")) },
        Forbidden: { description: "This action is disabled on this server.", content: json(ref("Error")) },
        RateLimited: {
          description: "Too many requests. Wait `Retry-After` seconds.",
          headers: {
            "Retry-After": { schema: { type: "integer" }, description: "Seconds until you may retry." },
            "X-RateLimit-Limit": { schema: { type: "integer" } },
            "X-RateLimit-Remaining": { schema: { type: "integer" } },
            "X-RateLimit-Reset": { schema: { type: "integer" }, description: "Seconds until the window resets." },
          },
          content: json(ref("Error")),
        },
        RpcError: { description: "The Stellar RPC was slow (`504`) or unavailable (`502`). Safe to retry.", content: json(ref("Error")) },
        InternalError: { description: "Unexpected server error.", content: json(ref("Error")) },
      },
      schemas: {
        Error: obj(
          {
            error: obj(
              {
                code: { type: "string", enum: [...API_ERROR_CODES], description: "Stable, machine-readable. Switch on this." },
                message: str("Human-readable; may change."),
                details: obj({}, [], { additionalProperties: true, description: "Extra context, e.g. validation `issues` or `retryAfterSeconds`." }),
              },
              ["code", "message"],
            ),
          },
          ["error"],
        ),

        Policy: obj(policyProperties, [], {
          additionalProperties: true,
          description:
            "Your rules. Every field is optional; unknown fields are accepted and ignored. See `GET /v1/policy/schema` for presets.",
        }),

        PaymentRequirements: obj(
          {
            scheme: str(undefined, { example: "exact" }),
            network: str(undefined, { example: "stellar:testnet" }),
            asset: str("Asset contract address (`C…`)."),
            amount: str("Atomic units."),
            payTo: str("Merchant address."),
            maxTimeoutSeconds: int(),
            extra: obj({ sponsorBy: str(), feePayer: str(), memo: str() }, [], { additionalProperties: true }),
          },
          ["scheme", "network", "asset", "amount", "payTo", "maxTimeoutSeconds", "extra"],
          { description: "An x402 merchant's published payment requirements." },
        ),

        AnalyzeRequest: obj(
          {
            network: { ...NETWORK, description: "Must match the server's network (see `/v1/meta`)." },
            transactionXdr: str("Base64 `TransactionEnvelope` XDR, unsigned or signed. Fee-bump envelopes are analysed via their inner transaction.", { minLength: 1 }),
            policy: ref("Policy"),
            userWallet: { ...G_ADDRESS, description: "The account whose balances to evaluate. Required for `maxLossPercent` and `minPostUsdcBalance`." },
            integratorRequestId: str("Your own correlation id, echoed in `meta` and the audit log.", { maxLength: 256 }),
            paymentRequirements: ref("PaymentRequirements"),
          },
          ["network", "transactionXdr"],
        ),

        RiskFinding: obj(
          {
            code: str("See `GET /v1/detectors`.", { example: "UNLIMITED_TRUSTLINE" }),
            severity: { type: "string", enum: ["low", "medium", "high"] },
            message: str(),
            details: obj({}, [], { additionalProperties: true }),
          },
          ["code", "severity", "message"],
        ),

        EstimatedChanges: obj(
          {
            native: arrayOf(
              obj(
                {
                  accountId: str(),
                  preStroops: str(undefined, { nullable: true }),
                  postStroops: str(undefined, { nullable: true }),
                  deltaStroops: str("Signed stroops (1 XLM = 10,000,000).", { nullable: true }),
                },
                ["accountId", "preStroops", "postStroops", "deltaStroops"],
              ),
            ),
            assets: arrayOf(
              obj(
                {
                  accountId: str(),
                  asset: str("`CODE:ISSUER` or `C…`."),
                  assetCode: str(),
                  assetIssuer: str(undefined, { nullable: true }),
                  preBalance: str(),
                  postBalance: str(),
                  delta: str(),
                  decimals: int(),
                },
                ["accountId", "asset", "assetCode", "assetIssuer", "preBalance", "postBalance", "delta", "decimals"],
              ),
            ),
            trustlines: arrayOf(
              obj(
                {
                  kind: { type: "string", enum: ["trustline"] },
                  accountId: str(),
                  asset: str(),
                  newLimit: str("`\"0\"` means removal."),
                  direction: { type: "string", enum: ["added", "removed", "increased", "decreased", "unchanged"] },
                  message: str(),
                },
                ["kind", "accountId", "asset", "newLimit", "direction", "message"],
              ),
            ),
            allowances: arrayOf(
              obj(
                {
                  kind: { type: "string", enum: ["soroban_allowance"] },
                  tokenAddress: str(),
                  fromAddress: str(),
                  spender: str(),
                  amount: str(),
                  expirationLedger: { type: "integer", nullable: true },
                  message: str(),
                },
                ["kind", "tokenAddress", "fromAddress", "spender", "amount", "expirationLedger", "message"],
              ),
            ),
          },
          ["native", "assets", "trustlines", "allowances"],
        ),

        DecodedOperation: obj(
          {
            index: int(),
            type: str("SDK operation type, e.g. `payment`, `invokeHostFunction`."),
            source: str("Operation source override; null = the transaction source.", { nullable: true }),
            action: str("Normalized action, e.g. `payment`, `change_trust`, `soroban_transfer`."),
            description: str("One-line plain-language description."),
            details: obj({}, [], { additionalProperties: true }),
          },
          ["index", "type", "source", "action", "description"],
        ),

        TransactionSummary: obj(
          {
            operations: arrayOf(ref("DecodedOperation")),
            humanReadable: str("Single-line summary of the whole transaction."),
            primaryAction: str(),
            involvedContracts: arrayOf(str()),
            involvedAssets: arrayOf(str()),
          },
          ["operations", "humanReadable", "primaryAction", "involvedContracts", "involvedAssets"],
        ),

        CpiTrace: obj(
          {
            roots: arrayOf(ref("CpiNode")),
            allContractAddresses: arrayOf(str()),
            maxDepth: int(),
            totalInvocations: int(),
            truncated: bool("True when the parser hit its safety cap."),
          },
          ["roots", "allContractAddresses", "maxDepth", "totalInvocations"],
        ),
        CpiNode: obj(
          {
            contractAddress: str(),
            functionName: str(),
            depth: int(),
            authorizer: str(undefined, { nullable: true }),
            argsXdr: arrayOf(str()),
            children: arrayOf({ $ref: "#/components/schemas/CpiNode" }),
          },
          ["contractAddress", "functionName", "depth", "authorizer", "argsXdr", "children"],
        ),

        Suggestion: obj(
          {
            id: str(),
            severity: { type: "string", enum: ["info", "warning", "critical"] },
            category: str(),
            title: str(),
            description: str(),
            autoFixAvailable: bool(),
          },
          ["id", "severity", "category", "title", "description", "autoFixAvailable"],
        ),

        Attestation: obj(
          {
            signature: str("Base64 Ed25519 signature."),
            signerPublicKey: str("Stellar `G…` address of the signing key (also in `/v1/meta`)."),
            signedAt: int("Epoch milliseconds."),
            nonce: str("Base64 random freshness marker."),
          },
          ["signature", "signerPublicKey", "signedAt", "nonce"],
          {
            description:
              "Present only when the server has a signing key. Ed25519 over the UTF-8 string `txHash|safe|findingsDigest|signedAt|nonce`, where `txHash` is the hash YOU compute from your own XDR and `findingsDigest` is the hex SHA-256 of the key-sorted JSON of `riskFindings`. Verify it to detect a tampered verdict.",
          },
        ),

        AnalyzeResponse: obj(
          {
            safe: bool("False when your policy blocks the transaction."),
            reasons: arrayOf(str()),
            estimatedChanges: ref("EstimatedChanges"),
            riskFindings: arrayOf(ref("RiskFinding")),
            simulationWarnings: arrayOf(str()),
            annotation: obj({ summary: ref("TransactionSummary"), cpiTrace: ref("CpiTrace") }, ["summary", "cpiTrace"]),
            suggestions: arrayOf(ref("Suggestion")),
            meta: obj(
              {
                analysisVersion: str(undefined, { example: "v1" }),
                network: NETWORK,
                simulatedAt: str(undefined, { format: "date-time" }),
                confidence: { type: "string", enum: ["high", "medium", "low"], description: "Low when data was incomplete or simulation failed." },
                integratorRequestId: str(),
              },
              ["analysisVersion", "network", "simulatedAt", "confidence"],
            ),
            attestation: ref("Attestation"),
          },
          ["safe", "reasons", "estimatedChanges", "riskFindings", "simulationWarnings", "meta"],
        ),

        BatchRequest: obj(
          { transactions: { type: "array", minItems: 1, maxItems: 25, items: ref("AnalyzeRequest") } },
          ["transactions"],
        ),
        BatchResponse: obj(
          {
            count: int(),
            results: arrayOf(
              obj(
                {
                  index: int(),
                  status: { type: "string", enum: ["success", "error"] },
                  decision: ref("AnalyzeResponse"),
                  error: obj({ code: str(), message: str() }, ["code", "message"]),
                },
                ["index", "status"],
              ),
            ),
            summary: obj({ safe: int(), blocked: int(), errors: int() }, ["safe", "blocked", "errors"]),
          },
          ["count", "results", "summary"],
        ),

        DecodeRequest: obj({ network: NETWORK, transactionXdr: str(undefined, { minLength: 1 }) }, ["network", "transactionXdr"]),
        DecodeResponse: obj(
          {
            hash: str("Hex transaction hash (of the inner transaction for fee bumps)."),
            network: NETWORK,
            kind: { type: "string", enum: ["transaction", "fee_bump"] },
            source: str(),
            fee: str("Total fee in stroops."),
            sequence: str(),
            memo: obj({ type: str(), value: str(undefined, { nullable: true }) }, ["type", "value"]),
            timeBounds: obj({ minTime: str(), maxTime: str() }, ["minTime", "maxTime"], { nullable: true }),
            signatureCount: int(),
            feeBump: obj({ hash: str(), feeSource: str(), fee: str() }),
            summary: ref("TransactionSummary"),
            cpiTrace: ref("CpiTrace"),
          },
          ["hash", "network", "kind", "source", "fee", "sequence", "memo", "timeBounds", "signatureCount", "summary", "cpiTrace"],
        ),

        ReplayRequest: obj(
          { network: NETWORK, transactionXdr: str(undefined, { minLength: 1 }), ledger: int("Informational only; echoed as `replayLedger`.") },
          ["network", "transactionXdr"],
        ),
        ReplayResponse: obj(
          {
            simulation: obj({}, [], { additionalProperties: true, description: "Normalized simulation: status, err, accounts, authEntries, events, fee data." }),
            replayLedger: { type: "integer", nullable: true },
            replayedAt: str(undefined, { format: "date-time" }),
            isHistorical: bool("Always false."),
          },
          ["simulation", "replayLedger", "replayedAt", "isHistorical"],
        ),

        Meta: obj({}, [], { additionalProperties: true, description: "See the example in the documentation; fields are stable, additions are non-breaking." }),

        DetectorList: obj(
          {
            count: int(),
            detectors: arrayOf(
              obj(
                {
                  code: { type: "string", enum: DETECTOR_CATALOG.map((d) => d.code) },
                  category: str(),
                  title: str(),
                  description: str(),
                  severities: arrayOf({ type: "string", enum: ["low", "medium", "high"] }),
                  status: { type: "string", enum: ["active", "reserved"] },
                  policyFlag: str("The `policy` option that makes this finding blocking; absent = advisory only."),
                },
                ["code", "category", "title", "description", "severities", "status"],
              ),
            ),
          },
          ["count", "detectors"],
        ),

        PolicySchema: obj(
          {
            options: arrayOf(
              obj(
                {
                  name: str(),
                  type: { type: "string", enum: ["boolean", "number", "string", "string[]"] },
                  default: {},
                  description: str(),
                  relatedFindings: arrayOf(str()),
                  caveat: str(),
                },
                ["name", "type", "description"],
              ),
            ),
            presets: arrayOf(obj({ id: str(), name: str(), description: str(), policy: ref("Policy") }, ["id", "name", "description", "policy"])),
            notes: arrayOf(str()),
          },
          ["options", "presets", "notes"],
        ),

        KeyCreated: obj(
          {
            key: str("The secret. Shown once.", { example: "baret_k3J9…" }),
            id: str(undefined, { example: "key_0a1b2c3d4e5f6071" }),
            prefix: str("First characters of the key, for recognising it later."),
            name: str(),
            createdAt: str(undefined, { format: "date-time" }),
            rateLimitPerMin: int(),
            message: str(),
            warning: str("Present when the server cannot persist keys across restarts."),
          },
          ["key", "id", "prefix", "name", "createdAt", "rateLimitPerMin", "message"],
        ),
        KeyInfo: obj(
          {
            source: { type: "string", enum: ["issued", "static"] },
            id: str(),
            prefix: str(),
            name: str(),
            createdAt: str(undefined, { format: "date-time" }),
            lastUsedAt: str(undefined, { nullable: true, format: "date-time" }),
            rateLimitPerMin: int(),
            usage: obj(
              {
                total: int(),
                today: int(),
                last7Days: arrayOf(obj({ date: str(), count: int() }, ["date", "count"])),
                byEndpoint: obj({}, [], { additionalProperties: { type: "integer" } }),
              },
              ["total", "today", "last7Days", "byEndpoint"],
            ),
          },
          ["source", "id", "name"],
        ),

        AuditEntry: obj(
          {
            id: str(),
            timestamp: str(undefined, { format: "date-time" }),
            network: str(),
            safe: bool(),
            confidence: str(),
            riskCodes: arrayOf(str()),
            contractAddresses: arrayOf(str()),
            primaryAction: str(),
            userWallet: str(undefined, { nullable: true }),
            integratorRequestId: str(),
            durationMs: { type: "number" },
          },
          ["id", "timestamp", "network", "safe", "confidence", "riskCodes", "contractAddresses", "primaryAction"],
        ),
        AuditAggregate: obj(
          {
            totalAnalyses: int(),
            safeCount: int(),
            blockedCount: int(),
            topRiskCodes: arrayOf(obj({ code: str(), count: int() }, ["code", "count"])),
            topBlockedContracts: arrayOf(obj({ contractAddress: str(), count: int() }, ["contractAddress", "count"])),
            timeRange: obj({ from: str(), to: str() }, ["from", "to"]),
          },
          ["totalAnalyses", "safeCount", "blockedCount", "topRiskCodes", "topBlockedContracts", "timeRange"],
        ),
        AuditContract: obj(
          {
            contractAddress: str(),
            stats: obj(
              {
                contractAddress: str(),
                totalSeen: int(),
                blockedCount: int(),
                riskCodes: obj({}, [], { additionalProperties: { type: "integer" } }),
                lastSeen: str(),
              },
              [],
              { nullable: true },
            ),
            recentEntries: arrayOf(ref("AuditEntry")),
          },
          ["contractAddress", "stats", "recentEntries"],
        ),

        McpResult: obj(
          {
            content: arrayOf(obj({ type: { type: "string", enum: ["text"] }, text: str() }, ["type", "text"])),
            isError: bool(),
          },
          ["content"],
        ),

        Ready: obj(
          {
            status: { type: "string", enum: ["ready", "degraded"] },
            checks: obj({}, [], { additionalProperties: obj({ ok: bool(), error: str() }, ["ok"]) }),
          },
          ["status"],
        ),
      },
    },
  };
}
