import { useState } from "react";
import { AlertTriangle, KeyRound, Loader2, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import type { ApiErrorBody, Meta } from "./api";
import type { KeyState } from "./hooks";
import { CopyButton, Field, ghostButton, inputClass, primaryButton } from "./ui";
import { cn } from "@stellar-thorn/ui";

/** Plain-language versions of the errors a person can hit while creating a key. */
function explainKeyError(e: ApiErrorBody): string {
  switch (e.code) {
    case "FORBIDDEN":
      return "This server doesn't hand out free keys. Ask whoever runs it for one.";
    case "RATE_LIMITED": {
      const secs = Number(e.details?.retryAfterSeconds);
      const wait = Number.isFinite(secs) && secs > 0 ? ` Try again in about ${Math.ceil(secs / 60)} min.` : "";
      return `You've created several keys from this network already.${wait}`;
    }
    case "UNAVAILABLE":
      return "The server isn't issuing new keys right now. Try again later.";
    case "BAD_REQUEST":
      return "That name isn't valid. Use 1–64 characters.";
    default:
      return e.message;
  }
}

export function KeyPanel({ keyState, meta }: { keyState: KeyState; meta: Meta | null }) {
  // The secret is only worth showing prominently right after it is created.
  const [fresh, setFresh] = useState<string | null>(null);
  const [name, setName] = useState("my-project");
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const issuance = meta?.auth.keyIssuance.enabled;

  async function create() {
    const created = await keyState.create(name.trim() || "my-project");
    if (created) setFresh(created.key);
  }

  /* ───── just created: show the secret once ───── */
  if (keyState.key && fresh) {
    return (
      <div className="rounded-2xl border border-primary tint-primary p-5 shadow-brand sm:p-6">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 shrink-0 text-primary" size={20} />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-semibold uppercase tracking-tight">Your key is ready</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Copy it now. For your safety the server only keeps a hash, so it can't show this key again.
              (This browser also remembers it so the playground works.)
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-card px-3 py-2.5 font-mono text-sm">
                {fresh}
              </code>
              <CopyButton text={fresh} label="Copy key" className="justify-center py-2.5" />
            </div>
            {keyState.warning && (
              <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-[var(--warn)]">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {keyState.warning}
              </p>
            )}
            <button type="button" onClick={() => setFresh(null)} className={cn(primaryButton, "mt-4")}>
              I've saved it
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ───── has a key ───── */
  if (keyState.key) {
    const info = keyState.info;
    const usage = info?.usage;
    const peak = Math.max(1, ...(usage?.last7Days.map((d) => d.count) ?? [1]));
    return (
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <KeyRound size={16} className="text-primary" />
              <h3 className="font-display text-lg font-semibold uppercase tracking-tight">
                {info?.name ?? "Your API key"}
              </h3>
              {keyState.invalid ? (
                <span className="rounded-full bg-[var(--bad-dim)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--bad)]">
                  Not working
                </span>
              ) : (
                <span className="rounded-full bg-[var(--ok-dim)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--ok)]">
                  Active
                </span>
              )}
            </div>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              {info?.prefix ?? keyState.key.slice(0, 10)}
              {"•".repeat(14)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={keyState.key} label="Copy key" className="py-2" />
            <button type="button" onClick={() => void keyState.refresh()} className={ghostButton} aria-label="Refresh usage">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {keyState.invalid && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-[var(--bad-dim)] p-3 text-sm text-[var(--bad)]">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <span>
              The server no longer recognises this key. It was revoked, or the server was reset. Forget it and
              create a new one.
            </span>
          </p>
        )}

        {usage && (
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Today" value={usage.today} />
              <Stat label="All time" value={usage.total} />
              <Stat label="Limit" value={`${info?.rateLimitPerMin ?? "–"}/min`} />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Last 7 days</p>
              <div className="flex h-12 items-end gap-1.5" role="img" aria-label="Requests per day, last 7 days">
                {usage.last7Days.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.count}`}
                    className="w-4 rounded-sm fill-primary-soft"
                    style={{ height: `${Math.max(6, (d.count / peak) * 100)}%`, opacity: d.count ? 1 : 0.25 }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {keyState.error && <p className="mt-3 text-sm text-[var(--bad)]">{keyState.error.message}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {confirmRevoke ? (
            <>
              <span className="text-sm text-muted-foreground">Revoke for good? Anything using it stops working.</span>
              <button
                type="button"
                disabled={keyState.busy}
                onClick={async () => {
                  if (await keyState.revoke()) setConfirmRevoke(false);
                }}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--bad)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {keyState.busy && <Loader2 size={14} className="animate-spin" />} Yes, revoke
              </button>
              <button type="button" onClick={() => setConfirmRevoke(false)} className={ghostButton}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setConfirmRevoke(true)} className={ghostButton}>
                <Trash2 size={14} /> Revoke key
              </button>
              <button
                type="button"
                onClick={keyState.forget}
                className="px-2 py-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forget on this browser
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ───── no key yet ───── */
  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <h3 className="font-display text-xl font-semibold uppercase tracking-tight">Free key in one click</h3>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>· No account, no email. Name it and go.</li>
            <li>
              · {meta ? `${meta.limits.rateLimit.perKeyPerMinute} requests per minute` : "A generous per-minute limit"}{" "}
              on your own key.
            </li>
            <li>· Only a hash is stored on the server. Revoke it any time.</li>
            <li>· Works from a server, a script, or straight from the browser (CORS is on).</li>
          </ul>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
          className="space-y-3"
        >
          <Field label="What is this key for?" hint="Just a label for you: an app, a bot, a test.">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              className={inputClass}
              placeholder="my-project"
              autoComplete="off"
            />
          </Field>
          <button type="submit" disabled={keyState.busy || issuance === false || !name.trim()} className={cn(primaryButton, "w-full")}>
            {keyState.busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
            {keyState.busy ? "Creating…" : "Create free API key"}
          </button>
          {issuance === false && (
            <p className="text-sm text-[var(--warn)]">
              This server doesn't hand out free keys. Ask whoever runs it for one, then paste it into your code.
            </p>
          )}
          {keyState.error && <p className="text-sm text-[var(--bad)]">{explainKeyError(keyState.error)}</p>}
        </form>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary px-3 py-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
