import type { Transaction } from "@stellar/stellar-sdk";
import type { AppConfig } from "../config/index.js";
import type { EstimatedChanges } from "../domain/estimated-changes.js";
import type { RiskFinding } from "../domain/findings.js";
import type { NormalizedSimulation } from "../domain/simulation-normalized.js";
import type { PaymentRequirements, Policy } from "../domain/policy.js";
import type { CpiTrace } from "../domain/cpi-trace.js";
import type { TxAccountSet } from "../simulation/account-keys.js";
import { detectAllowanceAndTrustlineFindings } from "./detectors/deltas.js";
import { detectContractFindings } from "./detectors/programs.js";
import { detectSimulationFindings } from "./detectors/simulation.js";
import { detectCpiFindings } from "./detectors/cpi.js";
import { detectReputationFindings } from "./detectors/reputation.js";
import { detectResourceFindings } from "./detectors/compute.js";
import { detectX402Findings } from "./detectors/x402.js";
import { detectIncompleteDataFinding } from "./detectors/deltas.js";

export type RiskDetectionInput = {
  config: AppConfig;
  policy: Policy;
  simulation: NormalizedSimulation;
  /** Distinct accounts / contracts / assets the tx references. */
  txAccounts: TxAccountSet;
  estimatedChanges: EstimatedChanges;
  truncatedAccounts: boolean;
  userWallet: string | null;
  cpiTrace: CpiTrace;
  tx: Transaction;
  /** When present, run x402-specific shape & policy checks. */
  paymentRequirements?: PaymentRequirements;
};

/**
 * Fans the tx out through every detector. the order is significant only
 * insofar as "simulation failed" needs to surface first so downstream
 * detectors don't double-report it.
 */
export function runRiskDetection(input: RiskDetectionInput): RiskFinding[] {
  const {
    config,
    policy,
    simulation,
    txAccounts,
    estimatedChanges,
    truncatedAccounts,
    userWallet,
    cpiTrace,
    tx,
    paymentRequirements,
  } = input;

  const findings: RiskFinding[] = [];

  findings.push(...detectSimulationFindings(simulation));
  findings.push(
    ...detectContractFindings({
      contractAddresses: txAccounts.contractAddresses,
      config,
    }),
  );
  findings.push(...detectCpiFindings(cpiTrace, config));
  findings.push(
    ...detectReputationFindings([
      ...txAccounts.contractAddresses,
      ...txAccounts.classicAccountIds,
    ]),
  );
  findings.push(...detectResourceFindings(simulation, policy));
  findings.push(...detectAllowanceAndTrustlineFindings(estimatedChanges));
  findings.push(
    ...detectX402Findings({
      tx,
      txAccounts,
      policy,
      paymentRequirements,
    }),
  );

  const needsWalletForPolicy =
    policy.minPostUsdcBalance != null || policy.maxLossPercent != null;
  const userWalletMissingForBalanceRules =
    needsWalletForPolicy && userWallet == null;

  const incomplete = detectIncompleteDataFinding({
    truncatedAccounts,
    userWalletMissingForBalanceRules,
  });
  if (incomplete) findings.push(incomplete);

  return findings;
}
