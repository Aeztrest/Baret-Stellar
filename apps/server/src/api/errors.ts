/**
 * The one error envelope every route returns:
 *
 *   { "error": { "code": "BAD_REQUEST", "message": "...", "details": { ... } } }
 *
 * `code` is the stable, machine-readable part integrators switch on;
 * `message` is for humans and may change. Keep this list in sync with the
 * `ErrorCode` schema in `openapi.ts` (a test enforces it).
 */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "WRONG_NETWORK"
  | "RPC_ERROR"
  | "FACILITATOR_ERROR"
  | "UNAVAILABLE"
  | "INTERNAL_ERROR";

export const API_ERROR_CODES: readonly ApiErrorCode[] = [
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "WRONG_NETWORK",
  "RPC_ERROR",
  "FACILITATOR_ERROR",
  "UNAVAILABLE",
  "INTERNAL_ERROR",
];

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
};

export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ApiErrorBody {
  return { error: { code, message, details } };
}
