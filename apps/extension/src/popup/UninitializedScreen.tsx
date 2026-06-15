/**
 * Uninitialized screen — no wallet yet. Send the user to the options page,
 * which hosts the onboarding wizard (per docs/wallet-spec.md §9).
 */

import { ArrowRight, ShieldCheck } from "lucide-react";
import browser from "webextension-polyfill";
import { Mark } from "@stellar-thorn/ui";

export function UninitializedScreen() {
  const openOnboarding = () => {
    browser.runtime.openOptionsPage().catch(() => {
      // Fallback: opening options can fail in some embeds; spawn a tab.
      browser.tabs.create({ url: browser.runtime.getURL("src/options/index.html") });
    });
  };

  return (
    <div className="h-full flex flex-col px-6 py-8 gap-5">
      <div className="text-accent-soft flex items-center gap-2">
        <Mark size={20} />
        <span className="font-bold text-xs tracking-tight">Baret</span>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight leading-tight">
          A wallet that watches what happens after you sign.
        </h1>
        <p className="text-text-muted text-sm">
          Set up takes about three minutes. Devnet only for now — perfect to try without risk.
        </p>
      </div>

      <ul className="space-y-2 text-xs">
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

      <button onClick={openOnboarding} className="btn-primary w-full mt-auto">
        Set up wallet <ArrowRight size={13} />
      </button>
    </div>
  );
}
