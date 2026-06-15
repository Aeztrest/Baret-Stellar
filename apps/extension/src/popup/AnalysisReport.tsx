/**
 * Compact AnalysisReport for the popup (Stellar build).
 * Renders an AnalyzeResponse — the Blackthorn simulation verdict + findings
 * + balance changes — into a 360-wide column.
 */

import { useState } from "react";
import {
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  ChevronDown,
  Info,
  ArrowRight,
} from "lucide-react";
import type {
  AnalyzeResponse,
  RiskFindingPayload,
} from "@stellar-thorn/ext-protocol";

const SEVERITY_TONE: Record<
  RiskFindingPayload["severity"],
  { dot: string; bg: string; border: string; text: string }
> = {
  low: {
    dot: "bg-text-faint",
    bg: "rgba(20,20,20,0.035)",
    border: "rgba(20,20,20,0.10)",
    text: "var(--text-faint)",
  },
  medium: {
    dot: "bg-warn",
    bg: "rgba(251,191,36,0.07)",
    border: "rgba(251,191,36,0.25)",
    text: "var(--warn)",
  },
  high: {
    dot: "bg-bad",
    bg: "rgba(248,113,113,0.07)",
    border: "rgba(248,113,113,0.30)",
    text: "var(--bad)",
  },
  critical: {
    dot: "bg-bad",
    bg: "rgba(248,113,113,0.09)",
    border: "rgba(248,113,113,0.35)",
    text: "var(--bad)",
  },
};

const STROOPS_PER_XLM = 10_000_000n;

export function AnalysisReport({ result }: { result: AnalyzeResponse }) {
  const findings = result.riskFindings ?? [];
  const reasons = result.reasons ?? [];
  const changes = result.estimatedChanges;
  const significantNative = changes.native.filter(
    (n) =>
      n.deltaStroops !== null &&
      n.deltaStroops !== "0",
  );

  const hasAnyChange =
    significantNative.length > 0 ||
    changes.assets.length > 0 ||
    changes.allowances.length > 0 ||
    changes.trustlines.length > 0;

  return (
    <div className="space-y-3">
      <Hero result={result} reasons={reasons} />

      {hasAnyChange && (
        <Section label="What changes">
          <div className="space-y-1">
            {significantNative.map((n, i) => (
              <DeltaRow
                key={`xlm-${i}`}
                label={shortAddr(n.accountId)}
                value={formatStroopsAsXlm(n.deltaStroops!)}
                negative={(n.deltaStroops ?? "0").startsWith("-")}
              />
            ))}
            {changes.assets.map((a, i) => (
              <DeltaRow
                key={`asset-${i}`}
                label={a.assetCode || shortAddr(a.asset)}
                value={a.delta}
                negative={a.delta.startsWith("-")}
              />
            ))}
            {changes.trustlines.map((t, i) => (
              <DeltaRow
                key={`trust-${i}`}
                label={`Trustline ${t.direction} → ${shortAddr(t.asset)}`}
                value={t.newLimit}
                tone="warn"
              />
            ))}
            {changes.allowances.map((al, i) => (
              <DeltaRow
                key={`allow-${i}`}
                label={`Allowance → ${shortAddr(al.spender)}`}
                value={al.amount}
                tone="warn"
              />
            ))}
          </div>
        </Section>
      )}

      {findings.length > 0 && (
        <Section label={`Findings (${findings.length})`}>
          <div className="space-y-1.5">
            {findings.map((f, i) => (
              <FindingRow key={i} finding={f} />
            ))}
          </div>
        </Section>
      )}

      {result.simulationWarnings && result.simulationWarnings.length > 0 && (
        <Section label="Simulation logs">
          <ul className="space-y-0.5 text-[10px] font-mono text-text-faint">
            {result.simulationWarnings.slice(0, 6).map((w, i) => (
              <li key={i} className="break-all">
                {w}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Hero({
  result,
  reasons,
}: {
  result: AnalyzeResponse;
  reasons: string[];
}) {
  const tone =
    result.decision === "block"
      ? "bad"
      : result.decision === "advisory"
        ? "warn"
        : "ok";
  const Icon =
    result.decision === "block"
      ? ShieldX
      : result.decision === "advisory"
        ? AlertTriangle
        : ShieldCheck;
  const heading =
    result.decision === "block"
      ? "Blocked by your policy"
      : result.decision === "advisory"
        ? result.offline
          ? "Sim unavailable"
          : "Sign with caution"
        : "Safe to sign";

  return (
    <div
      className="rounded-card p-3.5 flex gap-3"
      style={{
        background:
          tone === "bad"
            ? "rgba(248,113,113,0.06)"
            : tone === "warn"
              ? "rgba(251,191,36,0.06)"
              : "rgba(52,211,153,0.06)",
        border:
          tone === "bad"
            ? "1px solid rgba(248,113,113,0.25)"
            : tone === "warn"
              ? "1px solid rgba(251,191,36,0.25)"
              : "1px solid rgba(52,211,153,0.25)",
      }}
    >
      <Icon
        size={20}
        className={
          tone === "bad"
            ? "text-bad shrink-0 mt-0.5"
            : tone === "warn"
              ? "text-warn shrink-0 mt-0.5"
              : "text-ok shrink-0 mt-0.5"
        }
      />
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-bold ${tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ok"}`}
        >
          {heading}
        </p>
        {reasons.length > 0 && (
          <ul className="text-[11px] text-text-muted mt-1 space-y-0.5">
            {reasons.slice(0, 3).map((r, i) => (
              <li key={i} className="flex gap-1.5 leading-relaxed">
                <Info size={9} className="text-text-faint mt-1 shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card !p-3 space-y-2">
      <button
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="label !mb-0">{label}</span>
        <ChevronDown
          size={11}
          className={`text-text-faint transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && children}
    </div>
  );
}

function DeltaRow({
  label,
  value,
  negative,
  tone,
}: {
  label: string;
  value: string;
  negative?: boolean;
  tone?: "warn" | "bad";
}) {
  const colorClass =
    tone === "warn"
      ? "text-warn"
      : tone === "bad"
        ? "text-bad"
        : negative
          ? "text-bad"
          : "text-ok";
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="font-mono text-text-muted truncate">{label}</span>
      <span className={`font-mono shrink-0 ${colorClass}`}>{value}</span>
    </div>
  );
}

function FindingRow({ finding }: { finding: RiskFindingPayload }) {
  const tone = SEVERITY_TONE[finding.severity];
  return (
    <div
      className="rounded-input px-2.5 py-2 flex items-start gap-2"
      style={{ background: tone.bg, border: `1px solid ${tone.border}` }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-pill mt-1 shrink-0 ${tone.dot}`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span
            className="font-mono text-[10px] font-semibold"
            style={{ color: tone.text }}
          >
            {finding.code}
          </span>
          <span
            className="text-[9px] uppercase tracking-wider font-bold px-1 py-px rounded"
            style={{ background: tone.border, color: tone.text }}
          >
            {finding.severity}
          </span>
        </div>
        <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
          {finding.message}
        </p>
      </div>
    </div>
  );
}

function shortAddr(s: string): string {
  if (s.length < 12) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function formatStroopsAsXlm(stroopsStr: string): string {
  const negative = stroopsStr.startsWith("-");
  const abs = negative ? stroopsStr.slice(1) : stroopsStr;
  try {
    const v = BigInt(abs);
    const whole = v / STROOPS_PER_XLM;
    const frac = (v % STROOPS_PER_XLM).toString().padStart(7, "0");
    return `${negative ? "-" : "+"}${whole.toString()}.${frac.slice(0, 6)} XLM`;
  } catch {
    return `${negative ? "-" : "+"}${abs} stroops`;
  }
}

export { ArrowRight };
