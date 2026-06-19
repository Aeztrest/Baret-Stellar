import type { AnalysisResult, GuardDecision } from "@stellar-thorn/swig-guard";

const KEY = "blackthorn.history.v1";
const MAX_ENTRIES = 200;

export interface HistoryEntry {
  id: string;
  createdAt: string;
  /** Human-readable label, e.g. "Send 0.05 XLM to GABC…7zN" */
  label: string;
  decision: GuardDecision;
  signature: string | null;
  reasons: string[];
  findings: AnalysisResult["riskFindings"];
  estimatedChanges?: AnalysisResult["estimatedChanges"];
  /** Was this transaction actually broadcast on-chain? */
  broadcast: boolean;
}

export function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function writeHistory(entries: HistoryEntry[]): void {
  const trimmed = entries.slice(0, MAX_ENTRIES);
  localStorage.setItem(KEY, JSON.stringify(trimmed));
}

export function appendHistory(entry: HistoryEntry): void {
  const all = readHistory();
  all.unshift(entry);
  writeHistory(all);
}

export function clearHistory(): void {
  localStorage.removeItem(KEY);
}

export function makeEntryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
