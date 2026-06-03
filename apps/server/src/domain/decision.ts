import type { EstimatedChanges } from "./estimated-changes.js";
import type { RiskFinding } from "./findings.js";
import type { StellarNetwork } from "../config/index.js";
import type { TransactionSummary } from "./instruction-summary.js";
import type { CpiTrace } from "./cpi-trace.js";

export type DecisionMeta = {
  analysisVersion: string;
  network: StellarNetwork;
  simulatedAt: string;
  confidence: "high" | "medium" | "low";
  integratorRequestId?: string;
};

export type TransactionAnnotation = {
  summary: TransactionSummary;
  cpiTrace: CpiTrace;
};

export type TransactionSuggestionOutput = {
  id: string;
  severity: "info" | "warning" | "critical";
  category: string;
  title: string;
  description: string;
  autoFixAvailable: boolean;
};

export type Decision = {
  safe: boolean;
  reasons: string[];
  estimatedChanges: EstimatedChanges;
  riskFindings: RiskFinding[];
  simulationWarnings: string[];
  annotation?: TransactionAnnotation;
  suggestions?: TransactionSuggestionOutput[];
  meta: DecisionMeta;
};
