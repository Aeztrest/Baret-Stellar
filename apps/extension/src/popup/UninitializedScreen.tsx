/**
 * Uninitialized screen — no wallet yet. Explains what setup does, then sends
 * the user to the options page in a full browser tab, which hosts the
 * onboarding wizard (per docs/wallet-spec.md §9).
 *
 * The popup is only 360px wide — far too cramped for the 8-step wizard — so
 * setup always runs in a real tab. We make that explicit with an
 * "Open setup in a new tab" button and close the popup once it's open.
 */

import { ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";
import browser from "webextension-polyfill";
import { Mark } from "@stellar-thorn/ui";

const OPTIONS_PATH = "src/options/index.html";

const STEPS = [
  "Set a passphrase and generate your keys — locally, on this device.",
  "Fund your wallet with testnet XLM and provision it on-chain.",
  "Pick a security policy. Then every signature passes through Baret.",
];

export function UninitializedScreen() {
  // Always open setup in a real browser tab — the wizard needs the room.
  // Prefer an explicit new tab (what the user expects); fall back to the
  // built-in options-page opener if tab creation is unavailable.
  const openSetupTab = () => {
    const url = browser.runtime.getURL(OPTIONS_PATH);
    browser.tabs
      .create({ url })
      .then(() => window.close())
      .catch(() => {
        browser.runtime.openOptionsPage().catch(() => {
          /* last resort: nothing else we can do */
        });
      });
  };

  return (
    <div className="h-full flex flex-col px-6 py-7 gap-5 overflow-y-auto">
      <div className="text-accent-soft flex items-center gap-2">
        <Mark size={20} />
        <span className="font-bold text-xs tracking-tight">Baret</span>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight leading-tight">
          A wallet that watches what happens after you sign.
        </h1>
        <p className="text-text-muted text-sm">
          Setup takes about three minutes and opens in a full browser tab —
          the popup is too small for it. Testnet only for now, so you can try it
          risk-free.
        </p>
      </div>

      {/* What setup actually does — three numbered steps. */}
      <div className="card !p-4 space-y-3">
        <p className="label !mb-0">How setup works</p>
        <ol className="space-y-2.5">
          {STEPS.map((line, i) => (
            <li key={line} className="flex items-start gap-2.5 text-xs text-text-muted">
              <span
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-accent-soft"
                style={{ background: "rgba(255,107,0,0.10)", border: "1px solid rgba(255,107,0,0.25)" }}
              >
                {i + 1}
              </span>
              <span className="leading-relaxed pt-0.5">{line}</span>
            </li>
          ))}
        </ol>
      </div>

      <ul className="space-y-1.5 text-xs">
        {[
          "Pre-flight simulation on every transaction",
          "Live monitoring of every grant you make",
          "One-tap revoke when something feels off",
        ].map((line) => (
          <li key={line} className="flex items-start gap-2 text-text-muted">
            <ShieldCheck size={11} className="mt-0.5 text-accent-soft shrink-0" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto space-y-2">
        <button onClick={openSetupTab} className="btn-primary w-full">
          Open setup in a new tab <ExternalLink size={13} />
        </button>
        <p className="text-[10px] text-text-faint text-center flex items-center justify-center gap-1">
          Opens the full Baret wallet page <ArrowRight size={9} /> you can close this popup
        </p>
      </div>
    </div>
  );
}
