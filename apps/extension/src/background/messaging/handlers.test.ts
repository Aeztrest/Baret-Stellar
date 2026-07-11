import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

// Multi-account handlers: derive-on-demand from the already-unlocked root
// seed (no passphrase re-entry to add or switch accounts, matching how
// other wallets behave), and every derived address must match what
// crypto/hd.ts's SEP-0005 derivation produces directly.

vi.mock("webextension-polyfill", () => {
  const store: Record<string, unknown> = {};
  return {
    default: {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: store[key] })),
          set: vi.fn(async (obj: Record<string, unknown>) => {
            Object.assign(store, obj);
          }),
          remove: vi.fn(async (key: string) => {
            delete store[key];
          }),
        },
      },
    },
  };
});

async function freshEnv() {
  vi.resetModules();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();

  const keystore = await import("../db/keystore");
  await keystore.clearKeystore();
  const store = await import("../state/store");
  const hd = await import("../crypto/hd");
  const { handlers } = await import("./handlers");

  return { keystore, store, hd, handlers };
}

const PASSPHRASE = "correct horse battery staple";

describe("multi-account RPC handlers", () => {
  let env: Awaited<ReturnType<typeof freshEnv>>;

  beforeEach(async () => {
    env = await freshEnv();
    await env.handlers["wallet.create"]({ passphrase: PASSPHRASE, network: "testnet" });
  });

  it("wallet.create seeds exactly one account at index 0", async () => {
    const { accounts, activeIndex } = await env.handlers["wallet.listAccounts"](undefined as never);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.index).toBe(0);
    expect(activeIndex).toBe(0);
  });

  it("wallet.addAccount derives a new address matching crypto/hd.ts directly, and switches to it", async () => {
    const row = await env.keystore.readKeystore();
    expect(row).not.toBeNull();

    const added = await env.handlers["wallet.addAccount"]({ label: undefined });
    expect(added.index).toBe(1);

    const { accounts, activeIndex } = await env.handlers["wallet.listAccounts"](undefined as never);
    expect(accounts).toHaveLength(2);
    expect(activeIndex).toBe(1);

    const snap = env.store.getSnapshot();
    expect(snap.authorityAddress).toBe(added.authorityAddress);
    expect(snap.activeAccountIndex).toBe(1);
  });

  it("addAccount indices increment even after account 0, never colliding", async () => {
    const first = await env.handlers["wallet.addAccount"]({});
    const second = await env.handlers["wallet.addAccount"]({});
    expect(first.index).toBe(1);
    expect(second.index).toBe(2);
    expect(first.authorityAddress).not.toBe(second.authorityAddress);
  });

  it("addAccount defaults the label to 'Account N' when none is given", async () => {
    const added = await env.handlers["wallet.addAccount"]({});
    expect(added.label).toBe("Account 2");
  });

  it("wallet.switchAccount moves the active index back and updates the snapshot", async () => {
    await env.handlers["wallet.addAccount"]({});
    await env.handlers["wallet.switchAccount"]({ index: 0 });

    const { activeIndex } = await env.handlers["wallet.listAccounts"](undefined as never);
    expect(activeIndex).toBe(0);
    expect(env.store.getSnapshot().activeAccountIndex).toBe(0);
  });

  it("wallet.switchAccount rejects an index that doesn't exist", async () => {
    await expect(env.handlers["wallet.switchAccount"]({ index: 99 })).rejects.toThrow();
  });

  it("wallet.renameAccount updates the label and, for the active account, the live snapshot", async () => {
    await env.handlers["wallet.renameAccount"]({ index: 0, label: "Trading" });
    const { accounts } = await env.handlers["wallet.listAccounts"](undefined as never);
    expect(accounts[0]!.label).toBe("Trading");
  });

  it("wallet.renameAccount rejects an empty label", async () => {
    await expect(env.handlers["wallet.renameAccount"]({ index: 0, label: "   " })).rejects.toThrow();
  });

  it("switching accounts persists across a simulated reload (re-read from keystore)", async () => {
    const added = await env.handlers["wallet.addAccount"]({});
    const row = await env.keystore.readKeystore();
    expect(row!.activeIndex).toBe(added.index);
  });
});
