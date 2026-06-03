import type { Transaction } from "@stellar/stellar-sdk";
import type { TxAccountSet } from "../../simulation/account-keys.js";
import type { Policy, PaymentRequirements } from "../../domain/policy.js";
import type { RiskFinding } from "../../domain/findings.js";

/**
 * x402-specific detector. Validates the candidate tx against the merchant's
 * `PaymentRequirements` and against server-side x402 policy rules. The shape
 * checks reflect the Stellar x402 implementation (Soroban SAC transfer +
 * optional memo), not Solana's TransferChecked layout.
 *
 * Codes emitted:
 *  - X402_MEMO_MISSING — policy requires a memo but the tx has none.
 *  - X402_DESTINATION_MISMATCH — payTo is not present anywhere in the tx.
 *  - X402_ASSET_MISMATCH — required asset is not referenced by the tx.
 *  - X402_NON_CANONICAL_ASSET — asset is not on the policy's allowed list.
 *
 * Amount + per-transfer destination checks remain in the Soroban event
 * pipeline (delta extractor → policy.engine), since the spend amount is
 * only knowable after the preflight projects the `transfer` event.
 */
export function detectX402Findings(input: {
  tx: Transaction;
  txAccounts: TxAccountSet;
  policy: Policy;
  paymentRequirements?: PaymentRequirements;
}): RiskFinding[] {
  const { tx, txAccounts, policy, paymentRequirements } = input;
  const findings: RiskFinding[] = [];

  if (policy.requireMemo && tx.memo.type === "none") {
    findings.push({
      code: "X402_MEMO_MISSING",
      severity: "medium",
      message:
        "Policy requires a memo but the transaction does not carry one.",
    });
  }

  if (policy.allowedAssets && policy.allowedAssets.length > 0) {
    const allow = new Set(policy.allowedAssets);
    for (const asset of txAccounts.assets) {
      if (!allow.has(asset)) {
        findings.push({
          code: "X402_NON_CANONICAL_ASSET",
          severity: "medium",
          message: `Asset ${asset} is not on the policy allowedAssets list.`,
          details: { asset },
        });
      }
    }
  }

  if (!paymentRequirements) return findings;

  // Verify destination presence.
  const payTo = paymentRequirements.payTo;
  if (
    payTo &&
    !txAccounts.classicAccountIds.includes(payTo) &&
    !txAccounts.contractAddresses.includes(payTo)
  ) {
    findings.push({
      code: "X402_DESTINATION_MISMATCH",
      severity: "high",
      message: `PaymentRequirements payTo (${payTo}) is not referenced anywhere in the transaction.`,
      details: { payTo },
    });
  }

  // Verify asset coverage. PaymentRequirements may use the bare Soroban
  // contract id (no prefix); our tx-asset collector renders them as `C:…`.
  const expectedAsset = paymentRequirements.asset;
  if (expectedAsset) {
    const candidates = [expectedAsset, `C:${expectedAsset}`];
    const matched = candidates.some((c) => txAccounts.assets.includes(c));
    if (!matched) {
      findings.push({
        code: "X402_ASSET_MISMATCH",
        severity: "high",
        message: `Required asset ${expectedAsset} is not present in the tx.`,
        details: { expectedAsset, txAssets: txAccounts.assets },
      });
    }
  }

  return findings;
}
