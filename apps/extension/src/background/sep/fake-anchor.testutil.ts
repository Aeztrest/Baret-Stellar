/**
 * A hermetic stand-in for an anchor, shared by the sep tests. It answers the
 * three things Baret calls (stellar.toml, SEP-10 challenge/token, SEP-6 info)
 * from a `fetch` replacement, and records every request. The challenge comes
 * from the SDK's server-side builder, so it is exactly what a real anchor sends.
 */

import { Keypair, Networks, WebAuth } from "@stellar/stellar-sdk";

export const FAKE_DOMAIN = "tr-mock-anchor.fly.dev";

export interface RecordedCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface FakeAnchorOptions {
  domain?: string;
  /** The key the anchor signs challenges with; also published in its toml. */
  serverKey?: Keypair;
  /** Overrides the challenge XDR for an account (to serve look-alikes). */
  challenge?: (account: string) => string;
  /** Overrides the JWT returned for an account. */
  token?: (account: string) => string;
  /** Overrides the toml text entirely. */
  toml?: (serverKey: Keypair, domain: string) => string;
  infoBody?: unknown;
  authPostStatus?: number;
  challengePassphrase?: string;
}

export function base64url(s: string): string {
  return Buffer.from(s).toString("base64url");
}

export function makeJwt(claims: Record<string, unknown>): string {
  return `${base64url('{"alg":"ES256"}')}.${base64url(JSON.stringify(claims))}.${base64url("sig")}`;
}

export const SAMPLE_INFO = {
  deposit: {
    USDC: { enabled: true, authentication_required: true, fee_percent: 0.5, funding_methods: ["bank_account"] },
  },
  withdraw: {
    USDC: { enabled: true, authentication_required: true, fee_percent: 0.5, funding_methods: ["bank_account"], types: { bank_account: { fields: {} } } },
  },
  fee: { enabled: false },
};

export function makeFakeAnchor(opts: FakeAnchorOptions = {}) {
  const domain = opts.domain ?? FAKE_DOMAIN;
  const serverKey = opts.serverKey ?? Keypair.random();
  const calls: RecordedCall[] = [];
  let lastAccount = "";

  const tomlText = opts.toml
    ? opts.toml(serverKey, domain)
    : [
        `NETWORK_PASSPHRASE="${Networks.TESTNET}"`,
        `SIGNING_KEY="${serverKey.publicKey()}"`,
        `WEB_AUTH_ENDPOINT="https://${domain}/auth"`,
        `TRANSFER_SERVER="https://${domain}/sep6"`,
        "",
      ].join("\n");

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url: url.toString(), headers, body });

    if (url.host !== domain) return new Response("wrong host", { status: 404 });
    if (url.pathname === "/.well-known/stellar.toml") return new Response(tomlText);
    if (url.pathname === "/auth" && method === "GET") {
      const account = url.searchParams.get("account") ?? "";
      lastAccount = account;
      const transaction =
        opts.challenge?.(account) ??
        WebAuth.buildChallengeTx(serverKey, account, domain, 300, Networks.TESTNET, domain);
      return json({ transaction, network_passphrase: opts.challengePassphrase ?? Networks.TESTNET });
    }
    if (url.pathname === "/auth" && method === "POST") {
      if (opts.authPostStatus && opts.authPostStatus !== 200) {
        return json({ error: "nope" }, opts.authPostStatus);
      }
      const token =
        opts.token?.(lastAccount) ??
        makeJwt({ iss: `https://${domain}/auth`, sub: lastAccount, iat: 1, exp: Math.floor(Date.now() / 1000) + 3600 });
      return json({ token });
    }
    if (url.pathname === "/sep6/info") return json(opts.infoBody ?? SAMPLE_INFO);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  return { fetchImpl, calls, serverKey, domain };
}
