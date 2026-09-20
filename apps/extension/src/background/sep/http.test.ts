import { describe, expect, it, vi } from "vitest";
import { AnchorError, anchorJson } from "./http";

const reply = (body: string, init: ResponseInit = {}) =>
  vi.fn(async () => new Response(body, { status: 200, ...init })) as unknown as typeof fetch;

const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as AnchorError);

describe("anchorJson", () => {
  it("returns the parsed body of a 2xx answer", async () => {
    await expect(anchorJson({ url: "https://a.example/x", fetchImpl: reply('{"ok":true}') })).resolves.toEqual({ ok: true });
  });

  it("refuses non-https endpoints without making a request", async () => {
    const fetchImpl = reply("{}");
    const err = await failure(anchorJson({ url: "http://a.example/x", fetchImpl }));
    expect(err?.code).toBe("BAD_RESPONSE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses an unparseable endpoint", async () => {
    const err = await failure(anchorJson({ url: "not a url", fetchImpl: reply("{}") }));
    expect(err?.code).toBe("BAD_RESPONSE");
  });

  it("sends the bearer token, JSON body and refuses redirects", async () => {
    const fetchImpl = reply("{}");
    await anchorJson({ url: "https://a.example/x", method: "POST", body: { a: 1 }, token: "tok", fetchImpl });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok", "Content-Type": "application/json" });
  });

  it("sends no Authorization header without a token", async () => {
    const fetchImpl = reply("{}");
    await anchorJson({ url: "https://a.example/x", fetchImpl });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("maps 401 and 403 to AUTH_REQUIRED", async () => {
    for (const status of [401, 403]) {
      const err = await failure(anchorJson({ url: "https://a.example/x", fetchImpl: reply("{}", { status }) }));
      expect(err?.code).toBe("AUTH_REQUIRED");
    }
  });

  it("maps 5xx to NETWORK without repeating the anchor's body", async () => {
    const err = await failure(anchorJson({ url: "https://a.example/x", fetchImpl: reply("stack trace /srv/app", { status: 502 }) }));
    expect(err?.code).toBe("NETWORK");
    expect(err?.message).not.toContain("stack trace");
  });

  it("quotes a 4xx anchor error, flattened and clipped", async () => {
    const long = "x".repeat(500);
    const err = await failure(
      anchorJson({ url: "https://a.example/x", fetchImpl: reply(JSON.stringify({ error: `bad\u0000\nasset ${long}` }), { status: 400 }) }),
    );
    expect(err?.code).toBe("REJECTED");
    expect(err?.message).toMatch(/^The anchor said: bad asset x+…$/);
    expect(err!.message.length).toBeLessThan(260);
  });

  it("falls back to a generic message when a 4xx carries no usable error", async () => {
    const err = await failure(anchorJson({ url: "https://a.example/x", fetchImpl: reply('{"error":{"a":1}}', { status: 400 }) }));
    expect(err?.code).toBe("REJECTED");
    expect(err?.message).toContain("HTTP 400");
  });

  it("rejects a 2xx answer that isn't JSON", async () => {
    const err = await failure(anchorJson({ url: "https://a.example/x", fetchImpl: reply("<html>") }));
    expect(err?.code).toBe("BAD_RESPONSE");
  });

  it("rejects an oversized answer, declared or streamed", async () => {
    const declared = await failure(
      anchorJson({ url: "https://a.example/x", maxBytes: 10, fetchImpl: reply("{}", { headers: { "content-length": "999" } }) }),
    );
    const streamed = await failure(anchorJson({ url: "https://a.example/x", maxBytes: 10, fetchImpl: reply(`{"a":"${"y".repeat(50)}"}`) }));
    expect(declared?.code).toBe("BAD_RESPONSE");
    expect(streamed?.code).toBe("BAD_RESPONSE");
  });

  it("reports a network failure generically, not with the underlying error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:443");
    }) as unknown as typeof fetch;
    const err = await failure(anchorJson({ url: "https://a.example/x", fetchImpl }));
    expect(err?.code).toBe("NETWORK");
    expect(err?.message).not.toContain("10.0.0.5");
  });

  it("gives up after the timeout", async () => {
    const fetchImpl = ((_u: string, init?: RequestInit) =>
      new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
    const err = await failure(anchorJson({ url: "https://a.example/x", fetchImpl, timeoutMs: 10 }));
    expect(err?.code).toBe("NETWORK");
  });
});
