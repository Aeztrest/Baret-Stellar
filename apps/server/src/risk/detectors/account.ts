import type { Operation, Transaction } from "@stellar/stellar-sdk";
import type { RiskFinding } from "../../domain/findings.js";

/** Stellar account flag bits (`AccountFlags` in the protocol). */
const ACCOUNT_FLAGS: Array<{ bit: number; name: string }> = [
  { bit: 1, name: "AUTH_REQUIRED" },
  { bit: 2, name: "AUTH_REVOCABLE" },
  { bit: 4, name: "AUTH_IMMUTABLE" },
  { bit: 8, name: "AUTH_CLAWBACK_ENABLED" },
];

function flagNames(mask: number | undefined): string[] {
  if (!mask) return [];
  return ACCOUNT_FLAGS.filter((f) => (mask & f.bit) !== 0).map((f) => f.name);
}

function signerKey(signer: NonNullable<Operation.SetOptions["signer"]>): {
  kind: string;
  key: string;
} {
  if ("ed25519PublicKey" in signer) return { kind: "ed25519", key: signer.ed25519PublicKey };
  if ("sha256Hash" in signer) {
    return { kind: "sha256Hash", key: Buffer.from(signer.sha256Hash).toString("hex") };
  }
  if ("preAuthTx" in signer) {
    return { kind: "preAuthTx", key: Buffer.from(signer.preAuthTx).toString("hex") };
  }
  return { kind: "ed25519SignedPayload", key: signer.ed25519SignedPayload };
}

/**
 * Stellar-native account-takeover shapes that no balance delta can reveal:
 * `AccountMerge` (drains the whole XLM balance and closes the account) and
 * `SetOptions` (hands signing control to another key, removes the owner's own
 * key, or rewrites the thresholds). These are the findings the
 * `blockAccountMerge` / `blockSignerChanges` / `blockMasterKeyRemoval` policy
 * flags gate on — without this detector those flags could never fire.
 *
 * Purely structural (reads the operations), so it needs no RPC and works the
 * same for fee-bump inner transactions.
 */
export function detectAccountFindings(tx: Transaction): RiskFinding[] {
  const findings: RiskFinding[] = [];

  for (const [index, op] of tx.operations.entries()) {
    const account = op.source ?? tx.source;

    if (op.type === "accountMerge") {
      const o = op as Operation.AccountMerge;
      findings.push({
        code: "ACCOUNT_MERGE_DETECTED",
        severity: "high",
        message: `Merges account ${account} into ${o.destination}: its entire XLM balance moves and the account is permanently closed.`,
        details: { operationIndex: index, account, destination: o.destination },
      });
      continue;
    }

    if (op.type !== "setOptions") continue;
    const o = op as Operation.SetOptions;

    if (o.masterWeight !== undefined && Number(o.masterWeight) === 0) {
      findings.push({
        code: "MASTER_KEY_REMOVED",
        severity: "high",
        message: `Sets the master key weight of ${account} to 0: the account's own key can no longer sign for it.`,
        details: { operationIndex: index, account },
      });
    }

    if (o.signer) {
      const { kind, key } = signerKey(o.signer);
      const weight = Number(o.signer.weight);
      const grants = weight > 0;
      findings.push({
        code: "SIGNER_CHANGE_DETECTED",
        // Granting signing weight hands control of the account to a key the
        // owner may not know; removing one is far less dangerous.
        severity: grants ? "high" : "medium",
        message: grants
          ? `Adds or updates a signer on ${account} with weight ${weight}: ${key} could sign for this account.`
          : `Removes signer ${key} from ${account}.`,
        details: { operationIndex: index, account, signerKind: kind, signer: key, weight },
      });
    }

    const thresholds = {
      low: o.lowThreshold,
      medium: o.medThreshold,
      high: o.highThreshold,
    };
    if (Object.values(thresholds).some((t) => t !== undefined)) {
      findings.push({
        code: "THRESHOLD_CHANGE_DETECTED",
        severity: "medium",
        message: `Changes the signing thresholds of ${account}.`,
        details: {
          operationIndex: index,
          account,
          thresholds: Object.fromEntries(
            Object.entries(thresholds).filter(([, v]) => v !== undefined),
          ),
        },
      });
    }

    const set = flagNames(o.setFlags as number | undefined);
    const cleared = flagNames(o.clearFlags as number | undefined);
    if (set.length > 0 || cleared.length > 0) {
      findings.push({
        code: "SET_OPTIONS_RISKY",
        severity: "medium",
        message: `Changes account flags on ${account}${
          set.includes("AUTH_IMMUTABLE") ? " (AUTH_IMMUTABLE cannot be undone)" : ""
        }.`,
        details: { operationIndex: index, account, setFlags: set, clearFlags: cleared },
      });
    }
  }

  return findings;
}
