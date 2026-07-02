/**
 * Sign request surface — full Baret pre-sign analysis flow.
 *
 * Pulls the pending sign request from background, fetches the structured
 * analysis (transaction kind only), renders the AnalysisReport, and resolves
 * the request with the user's verdict. The footer bar itself carries the
 * verdict tone — header-verdict and footer-CTA bookend in matching color so
 * the safe/warn/block signal reads at a glance, not just on the button.
 *
 * Spec: docs/wallet-spec.md §8 + docs/x402-defense.md.
 */

import { useCallback, useEffect, useState } from "react";
import { Globe, Loader2, X, ShieldCheck, AlertTriangle } from "lucide-react";
import type { AnalyzeResponse } from "@stellar-thorn/ext-protocol";
import { Button, usePolling } from "@stellar-thorn/ui";
import { useRpc } from "../shared/state-context";
import { AnalysisReport } from "./AnalysisReport";

interface PendingRequest {
  requestId: string;
  kind: "message" | "transaction" | "transactionAndSend" | "x402Payment";
  origin: string;
  payloadBase64: string;
  label?: string;
}

const KIND_VERB: Record<PendingRequest["kind"], string> = {
  message:            "Sign message",
  transaction:        "Sign transaction",
  transactionAndSend: "Sign and send",
  x402Payment:        "Approve x402 payment",
};

export function SignRequest() {
  const rpc = useRpc();
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll for the pending request once on mount; once we have it, hold it.
  const pollRequest = useCallback(async () => {
    try {
      const r = await rpc.call("tx.peekRequest", undefined as never);
      if (r) setRequest(r as PendingRequest);
    } catch { /* ignore */ }
  }, [rpc]);

  usePolling(pollRequest, 1000, { enabled: request === null });

  // Run Baret analysis as soon as we have a request.
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    setAnalyzing(true);
    setError(null);
    rpc.call("tx.analyzeRequest", { requestId: request.requestId })
      .then((r) => { if (!cancelled) setAnalysis(r as AnalyzeResponse); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setAnalyzing(false); });
    return () => { cancelled = true; };
  }, [request, rpc]);

  if (!request) {
    return (
      <div className="h-full flex items-center justify-center text-text-faint">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const onDecide = async (accept: boolean) => {
    setWorking(true);
    setError(null);
    try {
      await rpc.call("tx.sign", { requestId: request.requestId, accept });
      // Background will dispatch sign.end; PopupApp re-renders.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  };

  const blocked = analysis?.decision === "block";
  const advisory = analysis?.decision === "advisory";

  return (
    <div className="h-full flex flex-col bg-bg">
      <Header origin={request.origin} verb={KIND_VERB[request.kind]} />

      <div className="flex-1 overflow-y-auto px-4 py-3.5 flex flex-col gap-3">
        {analyzing && !analysis && (
          <div className="card !p-5 flex flex-col items-center gap-2.5 text-center">
            <Loader2 size={18} className="animate-spin text-accent-soft" />
            <p className="text-text-muted text-xs">Simulating with Baret…</p>
            <p className="text-text-faint text-[10px]">Decompiling instructions, running policy checks.</p>
          </div>
        )}

        {analysis && <AnalysisReport result={analysis} />}

        {/* Message preview (when kind=message) */}
        {request.kind === "message" && (
          <div className="card !p-3 space-y-1.5">
            <p className="label !mb-0">Message</p>
            <pre className="font-mono text-[10px] text-text-muted break-all whitespace-pre-wrap leading-tight max-h-24 overflow-y-auto">
              {decodeMessage(request.payloadBase64)}
            </pre>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 rounded-input text-xs flex items-start gap-2"
               style={{ background: "var(--bad-dim)", color: "var(--bad)" }}>
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <Footer
        analysis={analysis}
        working={working}
        kind={request.kind}
        onDecline={() => onDecide(false)}
        onSign={() => onDecide(true)}
        blocked={blocked}
        advisory={advisory}
      />
    </div>
  );
}

function Header({ origin, verb }: { origin: string; verb: string }) {
  return (
    <header className="px-4 pt-4 pb-3 border-b border-line shrink-0">
      <div className="flex items-center gap-1.5 text-accent-soft text-[11px] mb-1.5">
        <Globe size={11} />
        <span className="font-mono truncate">{origin}</span>
      </div>
      <h1 className="text-lg font-extrabold tracking-tight leading-tight">{verb}</h1>
    </header>
  );
}

function Footer({
  analysis, working, kind, onDecline, onSign, blocked, advisory,
}: {
  analysis: AnalyzeResponse | null;
  working: boolean;
  kind: PendingRequest["kind"];
  onDecline: () => void;
  onSign: () => void;
  blocked: boolean;
  advisory: boolean;
}) {
  const signLabel = kind === "transactionAndSend" ? "Sign & send" : "Sign";
  const signLabelOverride = blocked ? "Sign anyway" : advisory ? `${signLabel} anyway` : signLabel;

  const footerStyle = blocked
    ? { background: "var(--bad-dim)", borderTop: "1px solid var(--bad)" }
    : advisory
      ? { background: "var(--warn-dim)", borderTop: "1px solid var(--warn)" }
      : { background: "var(--bg-elevated)", borderTop: "1px solid var(--line)" };

  return (
    <footer className="p-3 flex flex-col gap-2 shrink-0" style={footerStyle}>
      {analysis?.offline && (
        <div className="text-[10px] text-warn px-2 leading-relaxed">
          Baret couldn't reach the analyzer. You're signing without protection.
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" fullWidth onClick={onDecline} disabled={working} leftIcon={<X size={13} />}>
          Decline
        </Button>
        <Button
          variant={blocked ? "danger" : "primary"}
          fullWidth
          onClick={onSign}
          disabled={working || !analysis}
          loading={working}
          leftIcon={!working ? <ShieldCheck size={13} /> : undefined}
        >
          {working ? (kind === "transactionAndSend" ? "Sending…" : "Signing…") : signLabelOverride}
        </Button>
      </div>
    </footer>
  );
}

function decodeMessage(base64: string): string {
  try {
    const bin = atob(base64);
    // Heuristic: if mostly printable ASCII, show as text; else hex.
    let printable = 0;
    for (let i = 0; i < bin.length; i++) {
      const c = bin.charCodeAt(i);
      if ((c >= 32 && c < 127) || c === 10 || c === 13 || c === 9) printable++;
    }
    if (printable / bin.length > 0.85) return bin;
    let hex = "";
    for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
    return `0x${hex}`;
  } catch { return base64; }
}
