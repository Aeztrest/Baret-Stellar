import type { PolicyProfile } from "./dsl.js";
import { BUILTIN_PROFILES } from "./dsl.js";

export class PolicyProfileStore {
  private profiles = new Map<string, PolicyProfile>();

  constructor() {
    for (const p of BUILTIN_PROFILES) {
      this.profiles.set(p.id, p);
    }
  }

  get(id: string): PolicyProfile | null {
    return this.profiles.get(id) ?? null;
  }

  list(): PolicyProfile[] {
    return [...this.profiles.values()];
  }

  upsert(profile: PolicyProfile): void {
    profile.updatedAt = new Date().toISOString();
    this.profiles.set(profile.id, profile);
  }

  delete(id: string): boolean {
    if (BUILTIN_PROFILES.some((p) => p.id === id)) return false;
    return this.profiles.delete(id);
  }
}

let globalStore: PolicyProfileStore | null = null;

export function getPolicyProfileStore(): PolicyProfileStore {
  if (!globalStore) {
    globalStore = new PolicyProfileStore();
  }
  return globalStore;
}
