/**
 * Single source of truth for every demo scenario the showcase sites run.
 *
 * Each site imports its scenario copy from here, so the page button, the
 * success state, and the `scenarioLabel` handed to RiskPreview can never
 * disagree. The `id` maps to the transaction shape built in transactions.ts.
 */

import type { ScenarioId } from "./transactions";

export interface ScenarioCopy {
  /** Which transaction transactions.ts builds for this scenario. */
  id: ScenarioId;
  /** Canonical human label. Shown in the RiskPreview hero and reused on the page. */
  label: string;
}

/* ── ClaimHub: fictional LUMA airdrop (a made-up Stellar reward token) ── */

export const CLAIMHUB_AIRDROP = {
  assetCode: "LUMA",
  amount: 2_500,
  amountLabel: "2,500 LUMA",
  unlockNowLabel: "625 LUMA",
  totalPoolLabel: "50M LUMA",
  dangerDescription:
    "The claim transaction is an AccountMerge that sends your whole XLM balance to an attacker.",
} as const;

export function claimhubScenario(dangerous: boolean): ScenarioCopy {
  return dangerous
    ? {
        id: "claimhub-danger",
        label:
          "Claim airdrop (danger scenario · AccountMerge sends your whole XLM balance to an attacker)",
      }
    : {
        id: "claimhub-safe",
        label: `Claim airdrop · transfers ${CLAIMHUB_AIRDROP.amountLabel} to your wallet`,
      };
}

/* ── PixelDrop: Cyber Phantoms NFT mint ── */

export const PIXELDROP_MINT = {
  collection: "Cyber Phantoms",
  priceXlm: 25,
  priceUsd: 10,
  priceLabel: "25 XLM",
  priceUsdLabel: "$10.00",
  dangerDescription:
    "The mint transaction opens an unlimited trustline to an untrusted issuer.",
} as const;

export function pixeldropScenario(dangerous: boolean, qty: number): ScenarioCopy {
  const noun = qty > 1 ? "Cyber Phantoms" : "Cyber Phantom";
  return dangerous
    ? {
        id: "pixeldrop-danger",
        label: `Mint ${qty} ${noun} (danger scenario · unlimited trustline to an untrusted issuer)`,
      }
    : {
        id: "pixeldrop-safe",
        label: `Mint ${qty} ${noun} for ${(qty * PIXELDROP_MINT.priceXlm).toFixed(0)} XLM`,
      };
}

/* ── NovaSwap: token swap ── */

export const NOVASWAP_DANGER = {
  dangerDescription:
    "The swap transaction grants an unlimited Soroban approve to a stranger contract.",
} as const;

export function novaswapScenario(
  dangerous: boolean,
  amount: string,
  fromSymbol: string,
  toSymbol: string,
  outputAmount: number,
): ScenarioCopy {
  return dangerous
    ? {
        id: "novaswap-danger",
        label: `Swap ${amount} ${fromSymbol} → ${toSymbol} (danger scenario · unlimited approve to a drainer contract)`,
      }
    : {
        id: "novaswap-safe",
        label: `Swap ${amount} ${fromSymbol} → ${
          Number.isFinite(outputAmount) ? outputAmount.toFixed(4) : "0"
        } ${toSymbol}`,
      };
}

/* ── OrbitYield: XLM staking ── */

export const ORBITYIELD_DANGER_POOL = {
  name: "SuperYield Protocol",
  apyPct: 48,
  receiveToken: "syXLM",
  dangerDescription:
    "An unverified pool advertising 48% APY. The deposit warns on its resource fee.",
} as const;

export function orbityieldScenario(
  dangerous: boolean,
  amount: string,
  poolName: string,
): ScenarioCopy {
  return dangerous
    ? {
        id: "orbityield-warn",
        label: `Stake ${amount} XLM in ${ORBITYIELD_DANGER_POOL.name}, an unverified pool (warn scenario)`,
      }
    : {
        id: "orbityield-safe",
        label: `Stake ${amount} XLM in ${poolName}`,
      };
}

/* ── LaunchPad: token sale contribution ── */

export const LAUNCHPAD_PROJECTS = {
  safe: { name: "NovaBridge", ticker: "NOVA", priceUsd: 0.05 },
  danger: { name: "Nimbus Protocol", ticker: "NMBS", priceUsd: 0.02 },
  dangerDescription:
    "The contribution grants an unlimited USDC approve to the launch contract.",
} as const;

export function launchpadScenario(dangerous: boolean, contribution: string): ScenarioCopy {
  return dangerous
    ? {
        id: "launchpad-danger",
        label: `Contribute ${contribution} USDC to the ${LAUNCHPAD_PROJECTS.danger.name} sale (danger scenario · unlimited USDC approve to the launch contract)`,
      }
    : {
        id: "launchpad-safe",
        label: `Contribute ${contribution} USDC to the ${LAUNCHPAD_PROJECTS.safe.name} sale`,
      };
}
