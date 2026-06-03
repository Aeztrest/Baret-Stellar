import type { GuardPolicy } from "@stellar-thorn/swig-guard";
import { BALANCED_POLICY } from "@stellar-thorn/swig-guard";

const KEY = "blackthorn.policy.v1";

export function readPolicy(): GuardPolicy {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return BALANCED_POLICY;
    return JSON.parse(raw) as GuardPolicy;
  } catch {
    return BALANCED_POLICY;
  }
}

export function writePolicy(p: GuardPolicy): void {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function clearPolicy(): void {
  localStorage.removeItem(KEY);
}
