import { Link } from "react-router-dom";
import { Send as SendIcon, Download, Droplet, ShieldCheck, Clock, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useWallet } from "../wallet/state";
import { readHistory, type HistoryEntry } from "../storage/history-store";
import { readPolicy } from "../storage/policy-store";

export function Home() {
  const { session, walletBalance, authorityBalance, airdrop } = useWallet();
  const [airdropping, setAirdropping] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const policy = readPolicy();

  useEffect(() => { setHistory(readHistory().slice(0, 5)); }, []);

  const onAirdrop = async () => {
    setAirdropping(true);
    try { await airdrop(); } catch { /* surfaced elsewhere */ } finally { setAirdropping(false); }
  };

  const balance = session ? walletBalance : authorityBalance;
  const balanceLabel = session ? "Smart wallet" : "Authority (smart wallet not yet provisioned)";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black font-display text-ink-900 tracking-tight">Welcome back</h1>
        <p className="text-ink-500 text-sm mt-1">Your wallet is guarded by Baret — every signature is simulated first.</p>
      </div>

      {/* Balance hero — deliberate dark inspection console on the light page */}
      <div className="card !bg-ink-900 !border-ink-900 rounded-3xl p-6 relative overflow-hidden">
        <div className="hazard h-1 absolute top-0 left-0 right-0" />
        <p className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-2 mt-1">{balanceLabel}</p>
        <p className="text-5xl font-black font-display text-white">
          {balance === null ? "—" : balance.toFixed(4)}
          <span className="text-2xl text-white/40 font-bold ml-2">SOL</span>
        </p>
        <p className="text-xs text-white/40 mt-2">
          {session ? "Funds held by your Swig PDA" : "Send funds to authority — they'll move into the smart wallet on first transaction"}
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/send" className="btn-primary"><SendIcon size={13} /> Send</Link>
          <Link to="/receive" className="btn-ghost"><Download size={13} /> Receive</Link>
          <button onClick={onAirdrop} disabled={airdropping} className="btn-ghost">
            <Droplet size={13} /> {airdropping ? "Airdropping…" : "Devnet airdrop"}
          </button>
        </div>
      </div>

      {/* Two-up: policy summary + recent activity */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-accent" />
              <h2 className="font-bold text-ink-900 text-sm">Active policy</h2>
            </div>
            <Link to="/policies" className="text-xs text-ink-500 hover:text-accent">Edit →</Link>
          </div>
          <ul className="space-y-2 text-xs text-ink-600">
            <PolicyRow label="Max loss per tx" value={policy.maxLossPercent != null ? `${policy.maxLossPercent}%` : "Unset"} />
            <PolicyRow label="Block risky programs" value={policy.blockRiskyPrograms ? "On" : "Off"} />
            <PolicyRow label="Block unknown programs" value={policy.blockUnknownProgramExposure ? "On" : "Off"} />
            <PolicyRow label="Block new approvals" value={policy.blockApprovalChanges ? "On" : "Off"} />
            <PolicyRow label="Require successful sim" value={policy.requireSuccessfulSimulation !== false ? "Yes" : "No"} />
          </ul>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-accent" />
              <h2 className="font-bold text-ink-900 text-sm">Recent activity</h2>
            </div>
            <Link to="/history" className="text-xs text-ink-500 hover:text-accent">All →</Link>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-ink-400 py-6 text-center">No activity yet — try a Send to see Baret in action.</p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${h.decision === "allow" ? "bg-emerald-600" : "bg-[#DC2626]"}`} />
                    <span className="text-ink-700 truncate">{h.label}</span>
                  </div>
                  <span className="text-ink-400 shrink-0 ml-2">{relativeTime(h.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Link to="/policies" className="card p-5 flex items-center gap-4 hover:shadow-lift transition-shadow group">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-accent-dim">
          <ShieldCheck size={16} className="text-accent" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-ink-900 text-sm">Customize your protection</p>
          <p className="text-xs text-ink-500">Tune every Baret rule — loss caps, program allowlists, approval blocks.</p>
        </div>
        <ArrowRight size={14} className="text-ink-300 group-hover:text-accent transition-colors" />
      </Link>
    </div>
  );
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between">
      <span className="text-ink-400">{label}</span>
      <span className="text-ink-800 font-medium">{value}</span>
    </li>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}
