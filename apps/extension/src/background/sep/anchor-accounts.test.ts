import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNTS_TTL_MS,
  knownAnchorAccounts,
  type AnchorAccountsCache,
  type AnchorAccountsEntry,
} from "./anchor-accounts";
import type { AnchorToml } from "./toml";

const NOW = 1_800_000_000_000;

function memoryCache(initial: Record<string, AnchorAccountsEntry> = {}) {
  const state = { data: initial, writes: 0 };
  const cache: AnchorAccountsCache = {
    read: async () => structuredClone(state.data),
    write: async (v) => {
      state.data = structuredClone(v);
      state.writes += 1;
    },
  };
  return { cache, state };
}

const tomlWith = (accounts: string[]): AnchorToml => ({ accounts });

describe("knownAnchorAccounts", () => {
  it("uses a fresh entry without asking the anchor", async () => {
    const { cache } = memoryCache({ "a.example": { accounts: ["GA"], at: NOW - 1000 } });
    const load = vi.fn();
    const out = await knownAnchorAccounts(["a.example"], { load, cache, now: NOW });
    expect(out.get("a.example")).toEqual(["GA"]);
    expect(load).not.toHaveBeenCalled();
  });

  it("reads the toml when nothing is remembered, and remembers it", async () => {
    const { cache, state } = memoryCache();
    const load = vi.fn(async () => tomlWith(["GA", "GB"]));
    const out = await knownAnchorAccounts(["a.example"], { load, cache, now: NOW });
    expect(out.get("a.example")).toEqual(["GA", "GB"]);
    expect(state.data["a.example"]).toEqual({ accounts: ["GA", "GB"], at: NOW });
  });

  it("refreshes an entry older than a day", async () => {
    const { cache, state } = memoryCache({ "a.example": { accounts: ["OLD"], at: NOW - ACCOUNTS_TTL_MS - 1 } });
    const out = await knownAnchorAccounts(["a.example"], { load: async () => tomlWith(["NEW"]), cache, now: NOW });
    expect(out.get("a.example")).toEqual(["NEW"]);
    expect(state.data["a.example"]?.at).toBe(NOW);
  });

  it("keeps using an expired entry when the refresh fails, and doesn't rewrite it", async () => {
    const { cache, state } = memoryCache({ "a.example": { accounts: ["OLD"], at: NOW - ACCOUNTS_TTL_MS - 1 } });
    const out = await knownAnchorAccounts(["a.example"], { load: async () => Promise.reject(new Error("down")), cache, now: NOW });
    expect(out.get("a.example")).toEqual(["OLD"]);
    expect(state.writes).toBe(0);
  });

  it("knows nothing about an anchor it has never read and can't reach", async () => {
    const { cache, state } = memoryCache();
    const out = await knownAnchorAccounts(["a.example"], { load: async () => Promise.reject(new Error("down")), cache, now: NOW });
    expect(out.get("a.example")).toEqual([]);
    expect(state.writes).toBe(0);
  });

  it("treats a toml without ACCOUNTS as an anchor with no accounts", async () => {
    const { cache } = memoryCache();
    const out = await knownAnchorAccounts(["a.example"], { load: async () => ({}), cache, now: NOW });
    expect(out.get("a.example")).toEqual([]);
  });

  it("copes with an unreadable or unwritable cache", async () => {
    const broken: AnchorAccountsCache = {
      read: async () => Promise.reject(new Error("storage")),
      write: async () => Promise.reject(new Error("storage")),
    };
    const out = await knownAnchorAccounts(["a.example"], { load: async () => tomlWith(["GA"]), cache: broken, now: NOW });
    expect(out.get("a.example")).toEqual(["GA"]);
  });

  it("works without any cache", async () => {
    const out = await knownAnchorAccounts(["a.example"], { load: async () => tomlWith(["GA"]), now: NOW });
    expect(out.get("a.example")).toEqual(["GA"]);
  });

  it("handles each anchor on its own", async () => {
    const { cache } = memoryCache({ "a.example": { accounts: ["GA"], at: NOW } });
    const load = vi.fn(async () => tomlWith(["GB"]));
    const out = await knownAnchorAccounts(["a.example", "b.example"], { load, cache, now: NOW });
    expect(out.get("a.example")).toEqual(["GA"]);
    expect(out.get("b.example")).toEqual(["GB"]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
