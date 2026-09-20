/**
 * Guarded HTTP for anchor calls.
 *
 * Every response is third-party input: it is size-capped, time-boxed, fetched
 * over https without following redirects, and parsed defensively. Failures
 * surface as `AnchorError` whose message is written for the user; the
 * anchor's own error text is only ever included after being flattened and
 * shortened.
 */

export type AnchorErrorCode =
  | "NOT_ALLOWED"
  | "TOML_UNAVAILABLE"
  | "CHALLENGE_REJECTED"
  | "AUTH_REQUIRED"
  | "REJECTED"
  | "NETWORK"
  | "BAD_RESPONSE";

export class AnchorError extends Error {
  constructor(
    readonly code: AnchorErrorCode,
    message: string,
    /** Extra lines for the UI (for example, the rules a challenge broke). */
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "AnchorError";
  }
}

export class BodyTooLargeError extends Error {}

/** Reads a response body as text, refusing more than `maxBytes` however it is delivered. */
export async function readTextCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    if (text.length > maxBytes) throw new BodyTooLargeError();
    return text;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 256 * 1024;
const MAX_ANCHOR_MESSAGE = 200;

export interface AnchorRequest {
  url: string;
  method?: "GET" | "POST";
  /** Sent as JSON on POST. */
  body?: unknown;
  /** `Authorization: Bearer <token>` when set. */
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

/** One JSON request to an anchor endpoint. Resolves with the parsed body of a 2xx response. */
export async function anchorJson(req: AnchorRequest): Promise<unknown> {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    throw new AnchorError("BAD_RESPONSE", "The anchor published an invalid endpoint.");
  }
  if (url.protocol !== "https:") {
    throw new AnchorError("BAD_RESPONSE", "The anchor published a non-https endpoint, so Baret won't use it.");
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (req.token) headers.Authorization = `Bearer ${req.token}`;
  if (req.body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  let text: string;
  try {
    res = await (req.fetchImpl ?? fetch)(url.toString(), {
      method: req.method ?? "GET",
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      redirect: "error",
      signal: controller.signal,
    });
    text = await readTextCapped(res, req.maxBytes ?? DEFAULT_MAX_BYTES);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      throw new AnchorError("BAD_RESPONSE", "The anchor's answer was too large.");
    }
    throw new AnchorError("NETWORK", "Couldn't reach the anchor.");
  } finally {
    clearTimeout(timer);
  }

  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = undefined;
  }

  if (res.status === 401 || res.status === 403) {
    throw new AnchorError("AUTH_REQUIRED", "Sign in to the anchor first.");
  }
  if (res.status >= 500) {
    throw new AnchorError("NETWORK", `The anchor had an error (HTTP ${res.status}). Try again in a moment.`);
  }
  if (!res.ok) {
    throw new AnchorError("REJECTED", anchorMessage(body) ?? `The anchor refused the request (HTTP ${res.status}).`);
  }
  if (body === undefined) {
    throw new AnchorError("BAD_RESPONSE", "The anchor's answer wasn't valid JSON.");
  }
  return body;
}

/** The anchor's own `error` text, flattened and shortened; `null` when there isn't a usable one. */
function anchorMessage(body: unknown): string | null {
  if (!isRecord(body) || typeof body.error !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const flat = body.error.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (!flat) return null;
  const clipped = flat.length > MAX_ANCHOR_MESSAGE ? `${flat.slice(0, MAX_ANCHOR_MESSAGE)}…` : flat;
  return `The anchor said: ${clipped}`;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
