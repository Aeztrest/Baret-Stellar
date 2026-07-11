import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

// Every wallet created before multi-account support wrote a keystore row with
// no `accounts`/`activeIndex` fields. `readKeystore()` must migrate those
// rows losslessly (into a single account-0 entry, same addresses) rather
// than requiring a fresh wallet creation or losing the existing account.

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

async function freshKeystoreModule() {
  vi.resetModules();
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  return import("./keystore");
}

const FAKE_BLOB = {
  ciphertextB64: "AA==",
  ivB64: "AA==",
  saltB64: "AA==",
  iterations: 600_000,
  hash: "SHA-256" as const,
};

describe("readKeystore — legacy row migration", () => {
  let mod: Awaited<ReturnType<typeof freshKeystoreModule>>;

  beforeEach(async () => {
    mod = await freshKeystoreModule();
    // The webextension-polyfill mock's storage.local closure isn't
    // guaranteed to be re-created per test even after vi.resetModules(), so
    // explicitly clear both layers (IDB + mirror) for real test isolation.
    await mod.clearKeystore();
  });

  it("migrates a pre-multi-account row into a single account-0 entry, addresses unchanged", async () => {
    // Write a raw legacy-shaped row directly (bypassing writeKeystore's
    // current-shape typing) to simulate an existing installed wallet.
    const legacyRow = {
      id: "primary" as const,
      blob: FAKE_BLOB,
      authorityPubkey: "GLEGACYADDRESSUNCHANGED",
      smartWalletAddress: null,
      createdAt: 1000,
    };
    await mod.writeKeystore(legacyRow as unknown as Awaited<ReturnType<typeof mod.readKeystore>> & object);

    const migrated = await mod.readKeystore();
    expect(migrated).not.toBeNull();
    expect(migrated!.authorityPubkey).toBe("GLEGACYADDRESSUNCHANGED");
    expect(migrated!.activeIndex).toBe(0);
    expect(migrated!.accounts).toEqual([
      {
        index: 0,
        label: "Account 1",
        authorityPubkey: "GLEGACYADDRESSUNCHANGED",
        smartWalletAddress: null,
        createdAt: 1000,
      },
    ]);
    // blob (the actual secret material) is untouched by migration.
    expect(migrated!.blob).toEqual(FAKE_BLOB);
  });

  it("persists the migration so a second read doesn't re-migrate", async () => {
    const legacyRow = {
      id: "primary" as const,
      blob: FAKE_BLOB,
      authorityPubkey: "GLEGACY2",
      smartWalletAddress: "CSMARTWALLET",
      createdAt: 2000,
    };
    await mod.writeKeystore(legacyRow as unknown as Awaited<ReturnType<typeof mod.readKeystore>> & object);
    await mod.readKeystore(); // triggers + persists migration

    const second = await mod.readKeystore();
    expect(second!.accounts).toHaveLength(1);
    expect(second!.accounts[0]!.smartWalletAddress).toBe("CSMARTWALLET");
  });

  it("leaves an already-migrated (multi-account) row untouched", async () => {
    const modernRow = {
      id: "primary" as const,
      blob: FAKE_BLOB,
      authorityPubkey: "GACCT0",
      smartWalletAddress: null,
      createdAt: 3000,
      accounts: [
        { index: 0, label: "Account 1", authorityPubkey: "GACCT0", smartWalletAddress: null, createdAt: 3000 },
        { index: 1, label: "Account 2", authorityPubkey: "GACCT1", smartWalletAddress: null, createdAt: 3001 },
      ],
      activeIndex: 1,
    };
    await mod.writeKeystore(modernRow);

    const read = await mod.readKeystore();
    expect(read).toEqual(modernRow);
  });

  it("returns null when no keystore exists", async () => {
    expect(await mod.readKeystore()).toBeNull();
  });
});
