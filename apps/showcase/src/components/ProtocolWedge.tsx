/**
 * "The Wedge" — the section that has to do the one job the rest of the site
 * only gestured at: explain, explicitly, that x402 is a STATELESS payment
 * protocol (no allowance object, no revoke endpoint, no spend cap — by
 * design) and that Baret is a STATEFUL control-plane layer bolted on top of
 * it, not the protocol itself. Content sourced from docs/x402-defense.md.
 */

import { motion } from "framer-motion";
import { ArrowDown, KeyRound, Layers, ShieldAlert } from "lucide-react";
import { CompareSplit, Meter } from "@stellar-thorn/ui";

const TRACK_STEPS = ["402 Challenge", "Sign", "Pay", "Settle"];

const CALLOUTS = [
  {
    icon: Layers,
    gap: "Silent agent drift — an agent re-signs N micro-payments per minute; the protocol has no allowance object, so there's no aggregate view.",
    response: "Rolling per-merchant caps (hour/day). Every signature decrements a real number. Cap hit → block.",
  },
  {
    icon: ShieldAlert,
    gap: "Look-alike asset swap — a merchant publishes an “USDC” that isn't the canonical issuer; the spec only checks the asset field matches, not which issuer is real.",
    response: "Wallet-side asset allow-list seeded with network-canonical USDC. Unknown issuers require explicit override.",
  },
  {
    icon: KeyRound,
    gap: "Authority key compromise — if the signing key leaks, x402 has no per-merchant scope to contain the blast radius.",
    response: "Per-merchant scoped sub-key. A compromised key drains only that merchant's remaining cap. One-tap on-chain revoke.",
  },
];

export function ProtocolWedge() {
  return (
    <section className="px-6 py-24 bg-bone border-y border-ink-900/5">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mb-14"
        >
          <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-brand-600">
            <span className="w-6 h-[3px] rounded-full" style={{ background: "#FF6B00" }} />
            The wedge
          </p>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight leading-[1.08]">
            x402 is stateless. Baret isn't.
          </h2>
          <p className="mt-5 text-ink-500 leading-relaxed">
            x402 — the agentic-payment protocol now live on Stellar — is, by design, a{" "}
            <strong className="text-ink-900">stateless</strong> challenge/pay/settle handshake. Every
            payment is a fresh signed transfer: no allowance object, no revoke endpoint, no spend cap
            baked into the protocol itself. Baret is not the protocol — it's a{" "}
            <strong className="text-ink-900">stateful control-plane</strong> that sits on top of it,
            adding exactly the safety primitives x402 omits on purpose.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <CompareSplit
            leftLabel="x402 alone"
            rightLabel="x402 + Baret"
            leftTone="neutral"
            rightTone="accent"
            left={<Track steps={TRACK_STEPS} note="Each step forgets the last. No memory between calls." />}
            right={
              <TrackWithGuard
                steps={TRACK_STEPS}
                note="The ledger below is the one thing that remembers, across every call."
              />
            }
          />
        </motion.div>

        <div className="mt-12 grid md:grid-cols-3 gap-4">
          {CALLOUTS.map((c, i) => (
            <motion.div
              key={c.gap.slice(0, 12)}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="card p-5"
            >
              <c.icon size={16} className="text-brand-500" />
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-ink-400">Protocol gap</p>
              <p className="mt-1 text-sm text-ink-600 leading-relaxed">{c.gap}</p>
              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-brand-600">Baret's response</p>
              <p className="mt-1 text-sm text-ink-900 font-medium leading-relaxed">{c.response}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Track({ steps, note }: { steps: string[]; note: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="px-2.5 py-1.5 rounded-md text-[11px] font-mono font-semibold bg-white border border-ink-900/12 text-ink-600">
              {s}
            </span>
            {i < steps.length - 1 && <span className="text-ink-300 text-xs">→</span>}
          </span>
        ))}
      </div>
      <p className="text-xs text-ink-500 leading-relaxed">{note}</p>
    </div>
  );
}

function TrackWithGuard({ steps, note }: { steps: string[]; note: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="px-2.5 py-1.5 rounded-md text-[11px] font-mono font-semibold bg-white border border-ink-900/12 text-ink-600">
              {s}
            </span>
            {i === 1 && (
              <>
                <ArrowDown size={11} className="text-brand-500 rotate-[-90deg]" />
                <span className="px-2.5 py-1.5 rounded-md text-[11px] font-mono font-bold text-white" style={{ background: "#FF6B00" }}>
                  Baret guard
                </span>
              </>
            )}
            {i < steps.length - 1 && <span className="text-ink-300 text-xs">→</span>}
          </span>
        ))}
      </div>
      <p className="text-xs text-ink-500 leading-relaxed">{note}</p>
      <div className="pt-1">
        <Meter
          label="scrybe.baret.dev — daily cap"
          value={0.7}
          max={1.0}
          formatValue={(v, m) => `${v.toFixed(2)} / ${m.toFixed(2)} USDC`}
        />
      </div>
    </div>
  );
}
