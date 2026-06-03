import type { FastifyRequest } from "fastify";
import type { HTTPAdapter } from "@x402/core/server";

/**
 * Bridges Fastify requests to x402's framework-agnostic {@link HTTPAdapter}.
 * Maps `X-PAYMENT` to the signature header the core library looks for.
 */
export class FastifyX402HttpAdapter implements HTTPAdapter {
  constructor(private readonly req: FastifyRequest) {}

  getHeader(name: string): string | undefined {
    const n = name.toLowerCase();
    const pick = (key: string): string | undefined => {
      const v = this.req.headers[key];
      if (typeof v === "string") return v;
      if (Array.isArray(v)) return v[0];
      return undefined;
    };
    const direct = pick(n);
    if (direct) return direct;
    if (n === "payment-signature") {
      return pick("x-payment");
    }
    return undefined;
  }

  getMethod(): string {
    return this.req.method;
  }

  getPath(): string {
    return this.req.url.split("?")[0] || "/";
  }

  getUrl(): string {
    const host = this.req.headers.host ?? "localhost";
    const xfProto = this.req.headers["x-forwarded-proto"];
    const proto = typeof xfProto === "string" ? xfProto.split(",")[0]!.trim() : "http";
    return `${proto}://${host}${this.req.url}`;
  }

  getAcceptHeader(): string {
    return this.getHeader("accept") ?? "";
  }

  getUserAgent(): string {
    return this.getHeader("user-agent") ?? "";
  }

  getBody(): unknown {
    return this.req.body;
  }
}
