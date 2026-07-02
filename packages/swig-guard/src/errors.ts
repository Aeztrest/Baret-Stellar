import type { AnalysisResult } from "./types.js";

export class GuardError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "GuardError";
  }
}

/**
 * Thrown when the analyze endpoint cannot be reached or returns an error.
 * Fail-closed: callers must treat this as "unsafe to sign" unless they explicitly
 * choose otherwise (e.g., emergency offline mode).
 */
export class AnalyzeError extends GuardError {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly responseBody?: string,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = "AnalyzeError";
  }
}

/**
 * Thrown when policy evaluation rejects a transaction. Includes the full analysis
 * so the wallet UI can render reasons.
 */
export class GuardBlockedError extends GuardError {
  constructor(
    message: string,
    public readonly analysis: AnalysisResult,
    public readonly blockingReasons: string[],
  ) {
    super(message);
    this.name = "GuardBlockedError";
  }
}
