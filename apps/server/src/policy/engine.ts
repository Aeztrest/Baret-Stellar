import type { Policy } from "../domain/policy.js";
import type { Decision, DecisionMeta } from "../domain/decision.js";
import type { EstimatedChanges } from "../domain/estimated-changes.js";
import type { RiskFinding, RiskFindingCode } from "../domain/findings.js";
import type { NormalizedSimulation } from "../domain/simulation-normalized.js";
import type { StellarNetwork } from "../config/index.js";

const STELLAR_DECIMALS = 7;

export type PolicyEvaluationInput = {
  network: StellarNetwork;
  policy: Policy;
  simulation: NormalizedSimulation;
  estimatedChanges: EstimatedChanges;
  riskFindings: RiskFinding[];
  simulationWarnings: string[];
  /** Canonical USDC classic-asset identifier (`USDC:G…`). */
  usdcAsset: string;
  /** Stellar Asset-Contract address for USDC on the active network (`C…`). */
  usdcContractAddress: string;
  userWallet: string | null;
  integratorRequestId?: string;
};

function hasCode(findings: RiskFinding[], code: RiskFindingCode): boolean {
  return findings.some((f) => f.code === code);
}

function minAmountRaw(minUi: number): bigint {
  const scale = 10n ** BigInt(STELLAR_DECIMALS);
  return BigInt(Math.round(minUi * Number(scale)));
}

/**
 * Percent loss of a native balance, computed entirely in `bigint` until the
 * very last step. Converting `pre`/`delta` to `Number` first (as this used
 * to do) silently loses precision once stroop balances exceed
 * `Number.MAX_SAFE_INTEGER` (~900M XLM) — well within range for exchange
 * hot wallets or issuer accounts — which could mis-compute `maxLossPercent`
 * for exactly the large wallets a loss-percent policy matters most for.
 * The ratio itself is always a small, boundedly-sized percentage, so only
 * the final division-to-Number is safe to do in floating point.
 */
export function lossPercentFromStroops(pre: bigint, delta: bigint): number {
  if (delta >= 0n || pre <= 0n) return 0;
  const PPM = 1_000_000n; // parts-per-million of the loss ratio
  const lossRatioPpm = (-delta * PPM) / pre;
  return Number(lossRatioPpm) / 10_000; // ppm -> percent
}

export function evaluatePolicy(input: PolicyEvaluationInput): Decision {
  const {
    network,
    policy,
    simulation,
    estimatedChanges,
    riskFindings,
    simulationWarnings,
    usdcAsset,
    usdcContractAddress,
    userWallet,
    integratorRequestId,
  } = input;

  const reasons: string[] = [];
  const infoReasons: string[] = [];
  const extraPolicyFindings: RiskFinding[] = [];

  const requireOkSim = policy.requireSuccessfulSimulation !== false;
  if (simulation.status === "failed") {
    if (requireOkSim) {
      reasons.push("Soroban preflight failed; blocking under policy");
    } else {
      infoReasons.push(
        "Soroban preflight failed, but policy does not require successful simulation. allowed",
      );
    }
  }

  // Contract / sub-invocation policy gates.
  if (
    policy.blockRiskyContracts &&
    hasCode(riskFindings, "RISKY_CONTRACT_INTERACTION")
  ) {
    reasons.push("Risky contract interaction detected and blocked by policy");
  }
  if (
    policy.blockUnknownContractExposure &&
    hasCode(riskFindings, "UNKNOWN_CONTRACT_EXPOSURE") &&
    policy.allowWarnings !== true
  ) {
    reasons.push("Unknown contract exposure detected and blocked by policy");
  }

  // Allowance / trustline policy gates.
  if (
    policy.blockSorobanAllowanceGrants &&
    hasCode(riskFindings, "SOROBAN_ALLOWANCE_GRANTED")
  ) {
    reasons.push("Soroban allowance grant detected and blocked by policy");
  }
  if (
    policy.blockTrustlineChanges &&
    (hasCode(riskFindings, "TRUSTLINE_CHANGE_DETECTED") ||
      hasCode(riskFindings, "TRUSTLINE_REMOVED"))
  ) {
    reasons.push("Trustline change detected and blocked by policy");
  }
  if (
    policy.blockUnlimitedTrustlines &&
    hasCode(riskFindings, "UNLIMITED_TRUSTLINE")
  ) {
    reasons.push("Unlimited trustline detected and blocked by policy");
  }

  // Stellar account-shape policy gates.
  if (policy.blockAccountMerge && hasCode(riskFindings, "ACCOUNT_MERGE_DETECTED")) {
    reasons.push("AccountMerge op detected and blocked by policy");
  }
  if (
    policy.blockSignerChanges &&
    (hasCode(riskFindings, "SIGNER_CHANGE_DETECTED") ||
      hasCode(riskFindings, "THRESHOLD_CHANGE_DETECTED"))
  ) {
    reasons.push("Signer / threshold change detected and blocked by policy");
  }
  if (policy.blockMasterKeyRemoval && hasCode(riskFindings, "MASTER_KEY_REMOVED")) {
    reasons.push("Master-key removal detected and blocked by policy");
  }

  // Max loss percent (native XLM).
  if (policy.maxLossPercent != null) {
    if (!userWallet) {
      reasons.push("Cannot evaluate max loss percent without userWallet context");
      extraPolicyFindings.push({
        code: "LOSS_PERCENT_UNAVAILABLE",
        severity: "high",
        message: "maxLossPercent policy set but userWallet was not provided",
      });
    } else {
      const nativeRow = estimatedChanges.native.find(
        (n) => n.accountId === userWallet,
      );
      const pre = nativeRow?.preStroops;
      const delta = nativeRow?.deltaStroops;
      if (pre == null || delta == null || BigInt(pre) <= 0n) {
        reasons.push("Cannot estimate loss percent for user wallet (missing pre-state)");
        extraPolicyFindings.push({
          code: "LOSS_PERCENT_UNAVAILABLE",
          severity: "high",
          message: "Insufficient data to compute loss percent (fail-closed)",
        });
      } else {
        const lossPct = lossPercentFromStroops(BigInt(pre), BigInt(delta));
        if (lossPct > policy.maxLossPercent + 1e-9) {
          reasons.push(
            `Estimated XLM loss ${lossPct.toFixed(4)}% exceeds max allowed ${policy.maxLossPercent}%`,
          );
          extraPolicyFindings.push({
            code: "ESTIMATED_LOSS_EXCEEDS_MAX",
            severity: "high",
            message: "Estimated loss for user wallet exceeds policy threshold",
            details: {
              lossPercent: lossPct,
              maxLossPercent: policy.maxLossPercent,
            },
          });
        }
      }
    }
  }

  // Min post-tx token balance.
  if (policy.minPostUsdcBalance != null) {
    const asset =
      policy.minPostAsset?.trim() ||
      // Both the classic and Soroban-SAC forms are accepted. the asset
      // diff list keys on the classic form; Soroban-event-derived entries
      // appear under `C:<contractId>`.
      usdcAsset;
    const altAsset = `C:${usdcContractAddress}`;
    if (!userWallet) {
      reasons.push("Cannot evaluate minimum balance without userWallet context");
      extraPolicyFindings.push({
        code: "POST_BALANCE_TOO_LOW",
        severity: "high",
        message: "minPostUsdcBalance policy set but userWallet was not provided",
      });
    } else {
      const row = estimatedChanges.assets.find(
        (t) =>
          (t.asset === asset || t.asset === altAsset) &&
          t.accountId === userWallet,
      );
      if (!row) {
        reasons.push(
          `No projected balance for asset ${asset} on user wallet ${userWallet}`,
        );
        extraPolicyFindings.push({
          code: "POST_BALANCE_TOO_LOW",
          severity: "high",
          message:
            "Cannot verify post-transaction balance (asset not in simulation set)",
        });
      } else {
        const postRaw = BigInt(row.postBalance);
        const minRaw = minAmountRaw(policy.minPostUsdcBalance);
        if (postRaw < minRaw) {
          reasons.push(
            `Post-transaction balance is below minimum ${policy.minPostUsdcBalance}`,
          );
          extraPolicyFindings.push({
            code: "POST_BALANCE_TOO_LOW",
            severity: "high",
            message: "Estimated post-transaction balance is below policy minimum",
            details: { asset, min: policy.minPostUsdcBalance },
          });
        }
      }
    }
  }

  const mergedFindings = mergeFindings(riskFindings, extraPolicyFindings);

  const blocked = isBlocked({
    policy,
    simulation,
    mergedFindings,
    reasons,
  });

  const meta: DecisionMeta = {
    analysisVersion: "v1",
    network,
    simulatedAt: new Date().toISOString(),
    confidence: deriveConfidence(mergedFindings, simulation),
    integratorRequestId,
  };

  const allReasons = [...reasons, ...infoReasons];

  return {
    safe: !blocked,
    reasons: dedupeStrings(allReasons),
    estimatedChanges,
    riskFindings: mergedFindings,
    simulationWarnings,
    meta,
  };
}

type BlockInput = {
  policy: Policy;
  simulation: NormalizedSimulation;
  mergedFindings: RiskFinding[];
  reasons: string[];
};

function isBlocked(input: BlockInput): boolean {
  const { policy, simulation, mergedFindings, reasons } = input;
  if (reasons.length > 0) return true;

  const requireOkSim = policy.requireSuccessfulSimulation !== false;
  if (requireOkSim && simulation.status === "failed") return true;

  if (
    policy.blockRiskyContracts &&
    hasCode(mergedFindings, "RISKY_CONTRACT_INTERACTION")
  ) {
    return true;
  }
  if (
    policy.blockUnknownContractExposure &&
    hasCode(mergedFindings, "UNKNOWN_CONTRACT_EXPOSURE") &&
    policy.allowWarnings !== true
  ) {
    return true;
  }
  if (
    policy.blockSorobanAllowanceGrants &&
    hasCode(mergedFindings, "SOROBAN_ALLOWANCE_GRANTED")
  ) {
    return true;
  }
  if (
    policy.blockTrustlineChanges &&
    (hasCode(mergedFindings, "TRUSTLINE_CHANGE_DETECTED") ||
      hasCode(mergedFindings, "TRUSTLINE_REMOVED"))
  ) {
    return true;
  }
  if (
    policy.blockUnlimitedTrustlines &&
    hasCode(mergedFindings, "UNLIMITED_TRUSTLINE")
  ) {
    return true;
  }
  if (
    policy.blockAccountMerge &&
    hasCode(mergedFindings, "ACCOUNT_MERGE_DETECTED")
  ) {
    return true;
  }
  if (
    policy.blockSignerChanges &&
    (hasCode(mergedFindings, "SIGNER_CHANGE_DETECTED") ||
      hasCode(mergedFindings, "THRESHOLD_CHANGE_DETECTED"))
  ) {
    return true;
  }
  if (
    policy.blockMasterKeyRemoval &&
    hasCode(mergedFindings, "MASTER_KEY_REMOVED")
  ) {
    return true;
  }

  const policyViolationCodes: RiskFindingCode[] = [
    "LOSS_PERCENT_UNAVAILABLE",
    "ESTIMATED_LOSS_EXCEEDS_MAX",
    "POST_BALANCE_TOO_LOW",
  ];
  for (const c of policyViolationCodes) {
    if (hasCode(mergedFindings, c)) return true;
  }

  if (
    hasCode(mergedFindings, "LOW_CONFIDENCE_INCOMPLETE_DATA") &&
    policy.allowWarnings !== true
  ) {
    return true;
  }

  return false;
}

function mergeFindings(a: RiskFinding[], b: RiskFinding[]): RiskFinding[] {
  const seen = new Set<string>();
  const out: RiskFinding[] = [];
  for (const f of [...a, ...b]) {
    const k = `${f.code}:${JSON.stringify(f.details ?? {})}:${f.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

function deriveConfidence(
  findings: RiskFinding[],
  simulation: NormalizedSimulation,
): DecisionMeta["confidence"] {
  if (hasCode(findings, "LOW_CONFIDENCE_INCOMPLETE_DATA")) return "low";
  if (simulation.status === "failed") return "low";
  if (!simulation.preflighted) return "medium";
  return "high";
}

function dedupeStrings(xs: string[]): string[] {
  return [...new Set(xs)];
}
