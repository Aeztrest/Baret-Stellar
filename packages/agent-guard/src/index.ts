/**
 * @stellar-thorn/agent-guard — pre-sign transaction firewall for autonomous
 * agent & program wallets.
 *
 * Single entry point: construct an AgentWallet, then evaluate / guardedSign /
 * guardedSubmit. Policy templates and analysis types are re-exported from
 * swig-guard so consumers import everything from here.
 */

export {
  AgentWallet,
  type AgentWalletOptions,
  type EvaluateOptions,
  type GuardedSignOptions,
  type GuardedSignResult,
  type GuardedSubmitResult,
} from "./agent.js";

export {
  loadConfig,
  resolvePolicy,
  resolveHorizonUrl,
  readConfigFile,
  writeConfigFile,
  HORIZON_ENDPOINTS,
  DEFAULT_SERVER_URL,
  DEFAULT_NETWORK,
  CONFIG_PATH,
  CONFIG_DIR,
  type RawConfig,
  type ResolvedConfig,
  type PersistedConfig,
} from "./config.js";

// Re-export the guard primitives + policy toolkit so agent-guard is a
// one-stop import.
export {
  TransactionGuard,
  GuardBlockedError,
  GuardError,
  AnalyzeError,
  STRICT_POLICY,
  BALANCED_POLICY,
  PERMISSIVE_POLICY,
  POLICY_TEMPLATES,
  validatePolicy,
  normalizePolicy,
  maxSeverity,
  type GuardPolicy,
  type PolicyTemplate,
  type PolicyTemplateId,
  type GuardEvaluation,
  type GuardDecision,
  type AnalysisResult,
  type RiskFinding,
  type RiskSeverity,
  type RiskFindingCode,
  type EstimatedChanges,
  type StellarNetwork,
} from "@stellar-thorn/swig-guard";
