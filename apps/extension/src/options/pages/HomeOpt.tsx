/**
 * Options home dashboard (Stellar build).
 *
 * Live-polls authority + smart-wallet balances every 8 seconds. Until the
 * smart-wallet contract is provisioned, the authority key IS the wallet — we
 * surface its balance in the hero so the user always sees a real number.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Send,
  Download,
  Sparkles,
  Loader2,
  ExternalLink,
  Shield,
  Clock,
  ArrowRight,
} from "lucide-react";
import { useRpc, useWalletState } from "../../shared/state-context";
import type { GuardPolicy } from "@stellar-thorn/swig-guard";
import { shortAddr, usePolling } from "@stellar-thorn/ui";
import {
  OptionsSendModal,
  OptionsReceiveModal,
} from "../components/SendReceiveModal";

const STROOPS_PER_XLM = 10_000_000;

export function HomeOpt() {
  const state = useWalletState();
  const rpc = useRpc();
  const [walletBal, setWalletBal] = useState<number | null>(null);
  const [authBal, setAuthBal] = useState<number | null>(null);
  const [policy, setPolicy] = useState<GuardPolicy | null>(null);
  const [airdropping, setAirdropping] = useState(false);
  const [airdropMsg, setAirdropMsg] = useState<string | null>(null);
  const [airdropError, setAirdropError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<"send" | "receive" | null>(null);

  const refresh = useCallback(async () => {
    if (!state) return;
    try {
      if (state.walletAddress) {
        const r = await rpc.call("wallet.balance", {
          address: state.walletAddress,
        });
        setWalletBal(Number(r.stroops) / STROOPS_PER_XLM);
      } else {
        setWalletBal(null);
      }
      if (state.authorityAddress) {
        const r = await rpc.call("wallet.balance", {
          address: state.authorityAddress,
        });
        setAuthBal(Number(r.stroops) / STROOPS_PER_XLM);
      }
    } catch {
      /* ignore — UI shows last known */
    }
  }, [state, rpc]);

  usePolling(refresh, 8000);

  useEffect(() => {
    void rpc
      .call("policy.read", undefined as never)
      .then((p) => setPolicy(p as GuardPolicy));
  }, [rpc]);

  const onAirdrop = async () => {
    setAirdropping(true);
    setAirdropError(null);
    setAirdropMsg(null);
    try {
      const r = await rpc.call("wallet.airdrop", undefined as never);
      setAirdropMsg(
        r.amountXlm > 0
          ? `Received ${r.amountXlm} testnet XLM`
          : "Account already funded on testnet",
      );
      await refresh();
    } catch (err) {
      setAirdropError(err instanceof Error ? err.message : String(err));
    } finally {
      setAirdropping(false);
      setTimeout(() => {
        setAirdropMsg(null);
        setAirdropError(null);
      }, 4000);
    }
  };

  if (!state) return null;

  const heroBalance = state.walletAddress ? walletBal : authBal;
  const heroAddress = state.walletAddress ?? state.authorityAddress;
  const heroLabel = state.walletAddress
    ? "Smart wallet"
    : "Authority key (smart wallet pending)";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Welcome back</h1>
        <p className="text-text-muted text-sm mt-1">
          Your wallet is live on {state.network}. Every transaction passes
          Baret before signing.
        </p>
      </div>

      <section
        className="rounded-card p-6 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,107,0,0.08), rgba(255,107,0,0.015))",
          border: "1px solid var(--line)",
        }}
      >
        <p className="label">
          {heroLabel} · {shortAddr(heroAddress, { lead: 6, tail: 6 })}
        </p>
        <p className="text-5xl font-extrabold leading-none font-mono tracking-tight">
          {heroBalance === null ? "—" : heroBalance.toFixed(4)}
          <span className="text-2xl text-text-faint font-bold ml-2">XLM</span>
        </p>
        <p className="text-text-faint text-xs mt-2">
          {state.walletAddress
            ? walletBal && walletBal > 0
              ? "Funds available in your smart-wallet contract."
              : "Smart wallet empty — receive XLM or move some from your authority."
            : "Provision the smart-wallet contract from Settings to upgrade (Passkey sub-keys, x402 allowances)."}
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => setOverlay("send")}>
            <Send size={13} /> Send
          </button>
          <button className="btn-ghost" onClick={() => setOverlay("receive")}>
            <Download size={13} /> Receive
          </button>
          <button
            onClick={onAirdrop}
            disabled={airdropping}
            className="btn-ghost"
          >
            {airdropping ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Airdropping…
              </>
            ) : (
              <>
                <Sparkles size={13} /> Friendbot airdrop
              </>
            )}
          </button>
        </div>

        {airdropMsg && (
          <p
            className="text-[11px] mt-3"
            style={{ color: "var(--ok)" }}
          >
            {airdropMsg}
          </p>
        )}
        {airdropError && (
          <p
            className="text-[11px] mt-3"
            style={{ color: "var(--bad)" }}
          >
            {airdropError}
          </p>
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <Link to="/policies" className="card hover:bg-secondary transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-accent-soft" />
              <h2 className="font-bold text-sm">Active policy</h2>
            </div>
            <ArrowRight size={13} className="text-text-faint" />
          </div>
          <PolicySummary policy={policy} />
        </Link>

        <Link to="/sites" className="card hover:bg-secondary transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-accent-soft" />
              <h2 className="font-bold text-sm">Connected sites</h2>
            </div>
            <ArrowRight size={13} className="text-text-faint" />
          </div>
          <p className="text-text-faint text-xs leading-relaxed">
            Every dApp you connect, every x402 paywall you visit. Per-origin
            caps, pause, revoke.
          </p>
        </Link>
      </div>

      {state.walletAddress && (
        <section className="card">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h2 className="font-bold text-sm">Authority key</h2>
            <a
              href={stellarExpertAddress(state.authorityAddress, state.network)}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-accent-soft hover:text-text inline-flex items-center gap-1"
            >
              View on Stellar Expert <ExternalLink size={11} />
            </a>
          </div>
          <p className="font-mono text-xs text-text-muted break-all mb-2">
            {state.authorityAddress}
          </p>
          <p className="text-text-faint text-xs">
            Signs auth entries + tx envelopes on your behalf. Balance:{" "}
            <span className="font-mono text-text-muted">
              {authBal === null ? "—" : `${authBal.toFixed(4)} XLM`}
            </span>
            .
          </p>
        </section>
      )}

      {overlay === "send" && state.authorityAddress && (
        <OptionsSendModal
          authorityAddress={state.authorityAddress}
          network={state.network}
          balanceXlm={authBal}
          onClose={() => setOverlay(null)}
          onSent={refresh}
        />
      )}
      {overlay === "receive" && heroAddress && (
        <OptionsReceiveModal
          address={heroAddress}
          network={state.network}
          onClose={() => setOverlay(null)}
        />
      )}
    </div>
  );
}

function PolicySummary({ policy }: { policy: GuardPolicy | null }) {
  if (!policy) return <p className="text-xs text-text-faint">Loading…</p>;
  const rows: Array<[string, string]> = [
    [
      "Max loss per tx",
      policy.maxLossPercent != null ? `${policy.maxLossPercent}%` : "—",
    ],
    ["Block risky contracts", policy.blockRiskyContracts ? "On" : "Off"],
    ["Block Soroban allowances", policy.blockSorobanAllowanceGrants ? "On" : "Off"],
    [
      "Require preflight success",
      policy.requireSuccessfulSimulation !== false ? "Yes" : "No",
    ],
    [
      "x402 hourly cap",
      policy.x402HourlyCap != null
        ? `$${policy.x402HourlyCap.toFixed(2)}`
        : "—",
    ],
  ];
  return (
    <ul className="space-y-1.5 text-xs">
      {rows.map(([label, value]) => (
        <li key={label} className="flex justify-between">
          <span className="text-text-faint">{label}</span>
          <span className="font-medium">{value}</span>
        </li>
      ))}
    </ul>
  );
}

function stellarExpertAddress(addr: string | null, network: string): string {
  if (!addr) return "#";
  const slug = network === "pubnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${slug}/account/${addr}`;
}
