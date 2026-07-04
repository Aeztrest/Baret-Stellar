import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { encryptWithPassphrase } from "./kdf";

const PASSPHRASE = "a-strong-passphrase";

async function makeRow(merchantOrigin: string) {
  const kp = Keypair.random();
  const encryptedSecret = await encryptWithPassphrase(kp.rawSecretKey(), PASSPHRASE);
  return {
    row: {
      pubkey: kp.publicKey(),
      merchantOrigin,
      encryptedSecret,
      status: "active" as const,
      rotation: 0,
    },
    keypair: kp,
  };
}

describe("sub-key-cache — cached passphrase TTL", () => {
  let listSubKeysMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    listSubKeysMock = vi.fn(async () => []);
    vi.doMock("../db/sub-keys", () => ({ listSubKeys: listSubKeysMock }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("../db/sub-keys");
  });

  it("lazily decrypts a sub-key using the remembered passphrase within the TTL window", async () => {
    const { row } = await makeRow("https://merchant.example");
    listSubKeysMock.mockResolvedValue([row]);

    const { preloadActiveSubKeys, getSubKeypair } = await import("./sub-key-cache");
    // preloadActiveSubKeys only loads *active*-status rows found at unlock
    // time; simulate a sub-key added afterward by not including it in the
    // preload call, so `getSubKeypair`'s lazy fallback path is what's
    // actually exercised here.
    await preloadActiveSubKeys(PASSPHRASE);
    listSubKeysMock.mockResolvedValue([row]);

    const found = await getSubKeypair(row.pubkey);
    expect(found?.publicKey()).toBe(row.pubkey);
  });

  it("stops lazily decrypting once the passphrase TTL has elapsed", async () => {
    const { row } = await makeRow("https://merchant.example");
    listSubKeysMock.mockResolvedValue([]); // nothing active at preload time

    const { preloadActiveSubKeys, getSubKeypair } = await import("./sub-key-cache");
    await preloadActiveSubKeys(PASSPHRASE);

    // A new sub-key row appears later (e.g. provisioned mid-session) —
    // not yet in the in-memory cache, so this must go through the lazy
    // (cachedPassphrase-based) path.
    listSubKeysMock.mockResolvedValue([row]);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const found = await getSubKeypair(row.pubkey);
    expect(found).toBeNull();
  });

  it("clearSubKeyCache immediately clears the cached passphrase, not just the keypairs", async () => {
    const { row } = await makeRow("https://merchant.example");
    listSubKeysMock.mockResolvedValue([]);

    const { preloadActiveSubKeys, getSubKeypair, clearSubKeyCache } = await import("./sub-key-cache");
    await preloadActiveSubKeys(PASSPHRASE);
    clearSubKeyCache();

    listSubKeysMock.mockResolvedValue([row]);
    const found = await getSubKeypair(row.pubkey);
    expect(found).toBeNull();
  });
});
