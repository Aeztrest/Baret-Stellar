import { useState } from "react";
import { ChevronDown, Loader2, Lock, LockOpen, Play } from "lucide-react";
import { cn } from "@stellar-thorn/ui";
import { callApi, PUBLIC_API_URL, type ApiResult, type Meta } from "./api";
import { ENDPOINTS, ERROR_CODES, GROUPS, type Endpoint, type Param } from "./endpoints";
import { curlFor } from "./snippets";
import { CodeBlock, ghostButton, MethodBadge } from "./ui";

/* ═══════════════════════ endpoints ═══════════════════════ */

export function EndpointReference({ apiKey }: { apiKey: string | null }) {
  const [group, setGroup] = useState<(typeof GROUPS)[number] | "All">("All");
  const shown = ENDPOINTS.filter((e) => group === "All" || e.group === group);

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter endpoints">
        {(["All", ...GROUPS] as const).map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={group === g}
            onClick={() => setGroup(g)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              group === g
                ? "border-primary tint-primary-md text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="space-y-2.5">
        {shown.map((e) => (
          <EndpointCard key={`${e.method} ${e.path}`} endpoint={e} apiKey={apiKey} />
        ))}
      </div>
    </div>
  );
}

function EndpointCard({ endpoint: e, apiKey }: { endpoint: Endpoint; apiKey: string | null }) {
  const [open, setOpen] = useState(false);
  const hasBody = e.requestExample !== undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover-tint-secondary sm:p-4"
      >
        <MethodBadge method={e.method} />
        <span className="min-w-0 flex-1">
          <code className="block truncate font-mono text-sm font-semibold">{e.path}</code>
          <span className="mt-0.5 block text-sm text-muted-foreground">{e.summary}</span>
        </span>
        <span
          className="hidden shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex"
          title={e.auth === "key" ? "Needs an API key" : "No key needed"}
        >
          {e.auth === "key" ? <Lock size={12} /> : <LockOpen size={12} />}
          {e.auth === "key" ? "Key" : "Open"}
        </span>
        <ChevronDown size={16} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-5 border-t border-border p-4 sm:p-5">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{e.description}</p>

          {e.body && <ParamTable title="Request body" params={e.body} />}
          {e.query && <ParamTable title="Query parameters" params={e.query} />}

          <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
            <div className="min-w-0 space-y-3">
              <CodeBlock
                title="Example request"
                code={curlFor({
                  method: e.method,
                  path: e.path,
                  baseUrl: PUBLIC_API_URL,
                  key: e.auth === "key" ? "$BARET_API_KEY" : null,
                  body: hasBody ? e.requestExample : undefined,
                })}
                maxHeight="max-h-72"
              />
              {e.runnable && <Runner endpoint={e} apiKey={apiKey} />}
            </div>
            {e.responseExample !== undefined && (
              <CodeBlock
                title={`Example response · ${e.status ?? 200}`}
                language={typeof e.responseExample === "string" ? "text" : "json"}
                code={
                  typeof e.responseExample === "string"
                    ? e.responseExample
                    : JSON.stringify(e.responseExample, null, 2)
                }
                maxHeight="max-h-96"
              />
            )}
          </div>

          {e.errors && (
            <p className="text-xs text-muted-foreground">
              Can also return:{" "}
              {e.errors.map((c) => (
                <code key={c} className="mr-1.5 rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                  {c}
                </code>
              ))}
            </p>
          )}
          {e.notes && (
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              {e.notes.map((n, i) => (
                <li key={i}>· {n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ParamTable({ title, params }: { title: string; params: Param[] }) {
  return (
    <div>
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="overflow-hidden rounded-lg border border-border">
        {params.map((p, i) => (
          <div
            key={p.name}
            className={cn("grid gap-1 p-3 text-sm sm:grid-cols-[13rem_1fr]", i > 0 && "border-t border-border")}
          >
            <div>
              <code className="font-mono text-xs font-semibold">{p.name}</code>
              {p.required && <span className="ml-2 text-[10px] font-bold uppercase text-primary">required</span>}
              <div className="font-mono text-[11px] text-muted-foreground">{p.type}</div>
            </div>
            <p className="leading-relaxed text-muted-foreground">{p.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Runs a body-less GET straight from the docs and shows the live response. */
function Runner({ endpoint: e, apiKey }: { endpoint: Endpoint; apiKey: string | null }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult<unknown> | null>(null);
  const blocked = e.auth === "key" && !apiKey;

  async function run() {
    setBusy(true);
    setResult(await callApi(e.method as "GET", e.path, { key: e.auth === "key" ? apiKey : null }));
    setBusy(false);
  }

  return (
    <div>
      <button type="button" onClick={() => void run()} disabled={busy || blocked} className={ghostButton}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run it live
      </button>
      {blocked && <span className="ml-3 text-xs text-muted-foreground">Create a key above to run this one.</span>}
      {result && (
        <CodeBlock
          className="mt-3"
          language="json"
          title={`Live · HTTP ${result.status} · ${result.ms} ms`}
          code={JSON.stringify(result.ok ? result.data : { error: result.error }, null, 2)}
          maxHeight="max-h-72"
        />
      )}
    </div>
  );
}

/* ═══════════════════════ errors ═══════════════════════ */

export function ErrorTable() {
  return (
    <div className="space-y-4">
      <CodeBlock
        language="json"
        title="Every error has this shape"
        code={JSON.stringify(
          { error: { code: "WRONG_NETWORK", message: "Server is configured for testnet, request asked for pubnet", details: { serverNetwork: "testnet", requestedNetwork: "pubnet" } } },
          null,
          2,
        )}
      />
      <p className="text-sm leading-relaxed text-muted-foreground">
        Switch on <code className="font-mono text-foreground">code</code>: it is stable. The{" "}
        <code className="font-mono text-foreground">message</code> is for humans and may be reworded. Every response
        carries an <code className="font-mono text-foreground">X-Request-Id</code> header: include it if you report a
        problem.
      </p>
      <div className="overflow-hidden rounded-xl border border-border">
        {ERROR_CODES.map((c, i) => (
          <div key={c.code} className={cn("grid gap-1 bg-card p-3.5 text-sm md:grid-cols-[12rem_5rem_1fr_1fr] md:gap-4", i > 0 && "border-t border-border")}>
            <code className="font-mono text-xs font-semibold">{c.code}</code>
            <span className="font-mono text-xs text-muted-foreground">{c.status}</span>
            <span className="leading-relaxed text-muted-foreground">{c.meaning}</span>
            <span className="leading-relaxed">{c.action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════ limits & auth ═══════════════════════ */

export function LimitsPanel({ meta }: { meta: Meta | null }) {
  const rows: Array<[string, string]> = meta
    ? [
        ["Network", `${meta.network.name} (${meta.network.passphrase})`],
        ["Per-key rate limit", `${meta.limits.rateLimit.perKeyPerMinute} requests / minute`],
        [
          "Per-IP safety net",
          meta.limits.rateLimit.perIp
            ? `${meta.limits.rateLimit.perIp.max} requests / ${Math.round(meta.limits.rateLimit.perIp.windowMs / 1000)} s`
            : "off",
        ],
        ["Batch size", `up to ${meta.limits.maxBatchSize} transactions`],
        ["Request body", `up to ${(meta.limits.maxBodyBytes / 1024).toFixed(0)} KB`],
        ["Accounts inspected", `up to ${meta.limits.maxSimulationOperations} per transaction`],
        ["Request timeout", `${meta.limits.requestTimeoutMs / 1000} s`],
        [
          "Pay-per-request (x402)",
          meta.x402.enabled ? `${meta.x402.price} per /v1/analyze call, no key needed` : "not enabled on this server",
        ],
        [
          "Signed verdicts",
          meta.attestation.enabled && meta.attestation.signerPublicKey
            ? `on: verify against ${meta.attestation.signerPublicKey}`
            : "off on this server",
        ],
      ]
    : [];

  return (
    <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <h3 className="border-b border-border px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          This server, live
        </h3>
        {meta ? (
          rows.map(([k, v], i) => (
            <div key={k} className={cn("grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[11rem_1fr]", i > 0 && "border-t border-border")}>
              <span className="text-muted-foreground">{k}</span>
              <span className="break-all font-mono text-xs leading-relaxed">{v}</span>
            </div>
          ))
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Waiting for the server…</p>
        )}
      </div>

      <div className="space-y-4">
        <CodeBlock
          title="Authenticate: either header works"
          code={`Authorization: Bearer baret_your_key
# or
X-API-Key: baret_your_key`}
        />
        <CodeBlock
          title="Rate-limit headers on every keyed response"
          code={`X-RateLimit-Limit: 60
X-RateLimit-Remaining: 57
X-RateLimit-Reset: 41        # seconds until the window resets
Retry-After: 41              # only on 429`}
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Calling from a browser? CORS is enabled and these headers are readable from JavaScript. Never ship a key
          you can't afford to lose inside a public web page: for production, call Baret from your backend and keep
          the key there.
        </p>
      </div>
    </div>
  );
}
