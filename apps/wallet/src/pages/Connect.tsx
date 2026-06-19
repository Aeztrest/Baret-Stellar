import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Globe, X, ArrowRight, AlertTriangle } from "lucide-react";
import {
  isProtoMessage,
  PROTO_VERSION,
  type ConnectRequestMessage,
  type ConnectApprovedMessage,
  type ConnectRejectedMessage,
} from "@stellar-thorn/wallet-adapter";
import { useWallet } from "../wallet/state";

export function Connect() {
  const { identity, provisioned, phase, provision } = useWallet();
  const [request, setRequest] = useState<ConnectRequestMessage | null>(null);
  const [opener, setOpener] = useState<Window | null>(null);
  const [openerOrigin, setOpenerOrigin] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  // Capture window.opener once on mount.
  useEffect(() => {
    if (window.opener) {
      setOpener(window.opener as Window);
    }
  }, []);

  // Listen for the dApp's connect-request payload.
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (!isProtoMessage(ev.data)) return;
      const data = ev.data as ConnectRequestMessage;
      if (data.type !== "connect-request") return;
      setRequest(data);
      setOpenerOrigin(ev.origin);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Once the dApp has a window reference and the page has finished mounting,
  // signal that we're ready to receive the connect-request payload.
  const sentReady = useRef(false);
  useEffect(() => {
    if (sentReady.current || !opener) return;
    sentReady.current = true;
    opener.postMessage({ __bt: PROTO_VERSION, type: "popup-ready", requestId: "pending" }, "*");
  }, [opener]);

  // After the request arrives, repeat popup-ready with the proper requestId so
  // the adapter's correlation logic dispatches the right handler.
  useEffect(() => {
    if (!opener || !request) return;
    opener.postMessage({ __bt: PROTO_VERSION, type: "popup-ready", requestId: request.requestId }, openerOrigin ?? "*");
  }, [opener, request, openerOrigin]);

  const approve = async () => {
    if (!opener || !request || !openerOrigin || !identity) return;
    setWorking(true); setProvisionError(null);
    try {
      await provision();
      const wallet = identity.smartWalletAddress ?? identity.address;
      const msg: ConnectApprovedMessage = {
        __bt: PROTO_VERSION,
        type: "connect-approved",
        requestId: request.requestId,
        walletAddress: wallet,
        authorityAddress: identity.address,
        smartWalletAddress: wallet,
      };
      opener.postMessage(msg, openerOrigin);
      window.close();
    } catch (e) {
      setProvisionError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const reject = () => {
    if (!opener || !request || !openerOrigin) { window.close(); return; }
    const msg: ConnectRejectedMessage = {
      __bt: PROTO_VERSION,
      type: "connect-rejected",
      requestId: request.requestId,
      reason: "User declined the connection",
    };
    opener.postMessage(msg, openerOrigin);
    window.close();
  };

  if (phase === "loading") {
    return <PopupShell><p className="text-sm text-ink-500">Loading wallet…</p></PopupShell>;
  }
  if (phase === "unprovisioned") {
    return (
      <PopupShell>
        <Centered>
          <p className="text-sm text-ink-900">No wallet found in this browser.</p>
          <p className="text-xs text-ink-500">Open the wallet first to create one, then retry.</p>
        </Centered>
      </PopupShell>
    );
  }
  if (!request || !identity) {
    return <PopupShell><Centered><p className="text-sm text-ink-500">Waiting for dApp request…</p></Centered></PopupShell>;
  }

  const requestOrigin = request.origin;

  return (
    <PopupShell>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-center mb-5 space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,107,0,0.12)", border: "1px solid rgba(255,107,0,0.3)" }}>
            <Globe size={20} className="text-accent-soft" />
          </div>
          <h1 className="text-xl font-display font-bold text-ink-900">Connection request</h1>
          <p className="text-xs text-ink-500">
            <span className="font-mono text-accent-soft">{requestOrigin}</span> wants to connect to your Baret wallet.
          </p>
          {request.appName && <p className="text-xs text-ink-400">App: {request.appName}</p>}
        </div>

        <div className="glass rounded-xl p-4 mb-5 space-y-2">
          <Row label="Smart wallet" value={shortAddr(identity.smartWalletAddress ?? identity.address)} mono />
          <Row label="Authority" value={shortAddr(identity.address)} mono />
          <Row label="Status" value={provisioned ? "On-chain ✓" : "Will provision on approve"} />
        </div>

        <div className="rounded-xl p-3 mb-5 text-xs flex items-start gap-2" style={{ background: "rgba(255,107,0,0.07)", border: "1px solid rgba(255,107,0,0.2)" }}>
          <ShieldCheck size={13} className="text-accent-soft shrink-0 mt-0.5" />
          <p className="text-ink-600 leading-relaxed">
            Baret will simulate every transaction this dApp asks you to sign and check it against your policy. Risky txs are blocked at this wallet, not at the dApp.
          </p>
        </div>

        {provisionError && (
          <div className="rounded-xl px-3 py-2 mb-4 text-xs flex items-start gap-2" style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.3)", color: "#DC2626" }}>
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>{provisionError}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={reject} disabled={working} className="btn-ghost"><X size={13} /> Decline</button>
          <button onClick={approve} disabled={working} className="btn-primary disabled:opacity-50">
            {working ? "Connecting…" : <>Connect <ArrowRight size={13} /></>}
          </button>
        </div>
      </motion.div>
    </PopupShell>
  );
}

function PopupShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="text-center space-y-2">{children}</div>;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-ink-500">{label}</span>
      <span className={`text-ink-800 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function shortAddr(s: string) { return `${s.slice(0, 6)}…${s.slice(-6)}`; }
