/**
 * "The Wedge" — the section that has to do the one job the rest of the site
 * only gestured at: explain, explicitly, that x402 is a STATELESS payment
 * protocol (no allowance object, no revoke endpoint, no spend cap — by
 * design) and that Baret is a STATEFUL control-plane layer bolted on top of
 * it, not the protocol itself. Content sourced from docs/x402-defense.md.
 */

import { ArrowDown, KeyRound, Layers, ShieldAlert } from "lucide-react";
import {
  CompareSplit, Meter, Container, Eyebrow, Reveal, RevealGroup, RevealItem,
} from "@stellar-thorn/ui";

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
    <section id="wedge" className="border-y border-border bg-secondary py-20 sm:py-28">
      <Container>
        <Reveal>
          <div className="mb-14 flex max-w-3xl flex-col gap-5">
            <Eyebrow index="02">The wedge</Eyebrow>
            <h2 className="font-display text-4xl font-semibold uppercase leading-[0.95] tracking-[-0.03em] text-foreground md:text-5xl">
              x402 is stateless. Baret isn't.
            </h2>
            <p className="leading-relaxed text-muted-foreground">
              x402 — the agentic-payment protocol now live on Stellar — is, by design, a{" "}
              <strong className="text-foreground">stateless</strong> challenge/pay/settle handshake. Every
              payment is a fresh signed transfer: no allowance object, no revoke endpoint, no spend cap
              baked into the protocol itself. Baret is not the protocol — it's a{" "}
              <strong className="text-foreground">stateful control-plane</strong> that sits on top of it,
              adding exactly the safety primitives x402 omits on purpose.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
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
        </Reveal>

        <RevealGroup className="mt-12 grid gap-4 md:grid-cols-3">
          {CALLOUTS.map((c) => (
            <RevealItem key={c.gap.slice(0, 12)}>
              <div className="h-full rounded-xl border border-border bg-card p-5">
                <c.icon size={16} className="text-primary" />
                <p className="mt-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Protocol gap
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{c.gap}</p>
                <p className="mt-4 font-mono text-[11px] font-medium uppercase tracking-wider text-primary">
                  Baret's response
                </p>
                <p className="mt-1 text-sm font-medium leading-relaxed text-foreground">{c.response}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] font-semibold text-muted-foreground">
      {children}
    </span>
  );
}

function Track({ steps, note }: { steps: string[]; note: string }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <Chip>{s}</Chip>
            {i < steps.length - 1 && <span className="text-xs text-muted-foreground/50">→</span>}
          </span>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}

function TrackWithGuard({ steps, note }: { steps: string[]; note: string }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <Chip>{s}</Chip>
            {i === 1 && (
              <>
                <ArrowDown size={11} className="rotate-[-90deg] text-primary" />
                <span className="rounded-md bg-primary px-2.5 py-1.5 font-mono text-[11px] font-bold text-primary-foreground">
                  Baret guard
                </span>
              </>
            )}
            {i < steps.length - 1 && <span className="text-xs text-muted-foreground/50">→</span>}
          </span>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>
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
