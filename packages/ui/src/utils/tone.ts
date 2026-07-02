/**
 * Single source of truth for tone → color mapping (ok/warn/bad/live/accent/neutral).
 * Previously duplicated per-component across extension/wallet/showcase with
 * slightly different rgba literals; consumed by Badge and any status UI.
 */

export type Tone = "ok" | "warn" | "bad" | "live" | "accent" | "neutral";

export interface ToneStyle {
  color: string;
  background: string;
  border: string;
  dotColor: string;
}

const TONE_MAP: Record<Tone, ToneStyle> = {
  ok: {
    color: "var(--ok)",
    background: "var(--ok-dim)",
    border: "1px solid var(--ok)",
    dotColor: "var(--ok)",
  },
  warn: {
    color: "var(--warn)",
    background: "var(--warn-dim)",
    border: "1px solid var(--warn)",
    dotColor: "var(--warn)",
  },
  bad: {
    color: "var(--bad)",
    background: "var(--bad-dim)",
    border: "1px solid var(--bad)",
    dotColor: "var(--bad)",
  },
  live: {
    color: "var(--live)",
    background: "var(--live-dim)",
    border: "1px solid var(--live)",
    dotColor: "var(--live)",
  },
  accent: {
    color: "var(--accent)",
    background: "var(--accent-dim)",
    border: "1px solid var(--accent)",
    dotColor: "var(--accent)",
  },
  neutral: {
    color: "var(--text-muted)",
    background: "var(--bg-elevated)",
    border: "1px solid var(--line-strong)",
    dotColor: "var(--text-faint)",
  },
};

export function toneStyle(tone: Tone): ToneStyle {
  return TONE_MAP[tone];
}
