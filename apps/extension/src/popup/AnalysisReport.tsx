/**
 * Compact AnalysisReport for the popup (Stellar build).
 * Renders an AnalyzeResponse (the Baret verdict, findings, and balance
 * changes) into a 360-wide column.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import type {
  AnalyzeResponse,
  RiskFindingPayload,
} from "@stellar-thorn/ext-protocol";
import { Section, Verdict, shortAddr } from "@stellar-thorn/ui";

const SEVERITY_TONE: Record<
  RiskFindingPayload["severity"],
  { dot: string; bg: string; border: string; text: string; chipBg: string; chipText: string; chipBorder?: string }
> = {
  low: {
    dot: "bg-muted-foreground",
    bg: "var(--secondary)",
    border: "var(--border)",
    text: "var(--text-faint)",
    chipBg: "var(--bg-elevated)",
    chipText: "var(--text-muted)",
    chipBorder: "var(--line-strong)",
  },
  medium: {
    dot: "bg-warn",
    bg: "var(--warn-dim)",
    border: "var(--warn)",
    text: "var(--warn)",
    chipBg: "transparent",
    chipText: "var(--warn)",
    chipBorder: "var(--warn)",
  },
  high: {
    dot: "bg-bad",
    bg: "var(--bad-dim)",
    border: "var(--bad)",
    text: "var(--bad)",
    chipBg: "transparent",
    chipText: "var(--bad)",
    chipBorder: "var(--bad)",
  },
  // Critical reads visibly stronger than high: filled bad chip, ink-on-red.
  critical: {
    dot: "bg-bad",
    bg: "var(--bad-dim)",
    border: "var(--bad)",
    text: "var(--bad)",
    chipBg: "var(--bad)",
    chipText: "#fff",
    chipBorder: "var(--bad)",
  },
};

const SEVERITY_LABEL: Record<RiskFindingPayload["severity"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const STROOPS_PER_XLM = 10_000_000n;
const REASONS_PREVIEW = 3;

export function AnalysisReport({ result }: { result: AnalyzeResponse }) {
  const [reasonsExpanded, setReasonsExpanded] = useState(false);
  const findings = result.riskFindings ?? [];
  const reasons = result.reasons ?? [];
  const hiddenReasons = Math.max(0, reasons.length - REASONS_PREVIEW);
  const shownReasons =
    reasonsExpanded || hiddenReasons === 0 ? reasons : reasons.slice(0, REASONS_PREVIEW);
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

  const tone = result.decision === "block" ? "bad" : result.decision === "advisory" ? "warn" : "ok";
  const headline =
    result.decision === "block"
      ? "Blocked by your policy"
      : result.decision === "advisory"
        ? result.offline
          ? "Simulation unavailable"
          : "Sign with caution"
        : "Safe to sign";

  return (
    <div className="space-y-3">
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <Verdict tone={tone} headline={headline} reasons={shownReasons} />
        {hiddenReasons > 0 && !reasonsExpanded && (
          <button
            onClick={() => setReasonsExpanded(true)}
            className="mt-1 px-1 text-[10px] font-semibold text-text-faint hover:text-text transition-colors"
          >
            +{hiddenReasons} more {hiddenReasons === 1 ? "reason" : "reasons"}
          </button>
        )}
      </motion.div>

      {hasAnyChange && (
        <Section title="What changes" collapsible className="card !p-3">
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
        <Section title={`Findings (${findings.length})`} collapsible className="card !p-3">
          <div className="space-y-1.5">
            {findings.map((f, i) => (
              <FindingRow key={i} finding={f} />
            ))}
          </div>
        </Section>
      )}

      {result.simulationWarnings && result.simulationWarnings.length > 0 && (
        <Section title="Simulation logs" collapsible className="card !p-3">
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
      <span className={`font-mono font-bold tabular-nums shrink-0 ${colorClass}`}>{value}</span>
    </div>
  );
}

/**
 * One finding. The human sentence leads; the machine code is the footnote.
 */
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
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-bold text-text leading-snug">
            {finding.message}
          </p>
          <span
            className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-px rounded shrink-0"
            style={{
              background: tone.chipBg,
              color: tone.chipText,
              border: `1px solid ${tone.chipBorder ?? tone.chipBg}`,
            }}
          >
            {SEVERITY_LABEL[finding.severity]}
          </span>
        </div>
        <p
          className="font-mono text-[10px] mt-1"
          style={{ color: "var(--text-faint)" }}
        >
          {finding.code}
        </p>
      </div>
    </div>
  );
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
