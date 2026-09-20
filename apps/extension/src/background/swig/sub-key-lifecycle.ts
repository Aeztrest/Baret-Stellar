/**
 * Keeps a merchant's on-chain sub-key in step with its mandate.
 *
 * A sub-key is minted for one mandate: `provisionMerchantSubKey` binds the
 * policy allowance (`set_allowance`, `mandate_seconds`) and the wallet signer
 * (a `Temporary` signer with the same expiry) to it. When the mandate lapses
 * both expire on-chain, but the local allowance row stays "active" with a past
 * `expiresAt`. A renewal therefore has to mint a NEW sub-key; otherwise every
 * later auto-payment is signed by a key the chain no longer accepts.
 *
 * Runs after a manual approval, once the payment itself has been signed, so a
 * failure here never unwinds that payment (see `messaging/handlers.ts`).
 */

import { readAllowance, writeAllowance } from "../db/allowances";
import { appendHistory } from "../db/history";
import { findActiveSubKeyForMerchant, setSubKeyStatus, writeSubKey, type SubKeyRow } from "../db/sub-keys";
import { encryptWithPassphrase } from "../crypto/kdf";
import { useAuthority } from "../crypto/session";
import { evictSubKey, getCachedPassphrase, putSubKey } from "../crypto/sub-key-cache";
import { uiToAtomic } from "../x402/parse";
import { provisionMerchantSubKey } from "./sub-keys";

export type SubKeyRefreshOutcome =
  /** A still-valid sub-key exists and the mandate was live: nothing to do. */
  | "kept"
  /** No sub-key existed (first approval, or an earlier attempt failed): one was minted. */
  | "provisioned"
  /** The previous sub-key had lapsed with its mandate: a new one replaced it. */
  | "renewed"
  /** Minting failed: the merchant is paid with the wallet's admin key until the next approval. */
  | "failed";

export interface SubKeyRefreshInput {
  allowanceId: string;
  merchantOrigin: string;
  mandateSeconds: number;
  /**
   * Whether the mandate was still live when the user approved. A live mandate
   * means a repeat approval (for example under a Strict policy), not a first
   * grant or a renewal after expiry, so an existing sub-key is still valid.
   */
  mandateWasLive: boolean;
}

export async function refreshSubKeyAfterApproval(input: SubKeyRefreshInput): Promise<SubKeyRefreshOutcome> {
  const { allowanceId, merchantOrigin, mandateSeconds, mandateWasLive } = input;
  const row = await readAllowance(allowanceId);
  if (!row) return "kept";

  const existing = await findActiveSubKeyForMerchant(row.accountPubkey, merchantOrigin);
  if (existing && mandateWasLive) return "kept";

  try {
    const passphrase = getCachedPassphrase();
    if (!passphrase) {
      throw new Error("the wallet passphrase is no longer cached; unlock the wallet again, then approve");
    }
    const authority = useAuthority();
    const result = await provisionMerchantSubKey(
      authority,
      row.payTo,
      row.asset,
      uiToAtomic(row.capPerTx),
      uiToAtomic(row.capPerDay),
      mandateSeconds,
    );

    const now = Date.now();
    const next: SubKeyRow = {
      pubkey: result.subKey.publicKey(),
      accountPubkey: row.accountPubkey,
      merchantOrigin,
      encryptedSecret: await encryptWithPassphrase(result.subKey.rawSecretKey(), passphrase),
      status: "active",
      rotation: existing ? existing.rotation + 1 : 0,
      provisionSignature: result.signature,
      revokeSignature: null,
      createdAt: now,
      updatedAt: now,
    };
    await writeSubKey(next);
    putSubKey(next.pubkey, result.subKey);
    if (existing) {
      await setSubKeyStatus(existing.pubkey, "revoked");
      evictSubKey(existing.pubkey);
    }

    row.subKeyPubkey = next.pubkey;
    row.updatedAt = now;
    await writeAllowance(row);

    await appendHistory({
      type: "alert",
      accountPubkey: row.accountPubkey,
      signature: result.signature,
      origin: merchantOrigin,
      summary: existing
        ? `Renewed scoped on-chain sub-key for ${merchantOrigin}`
        : `Provisioned scoped on-chain sub-key for ${merchantOrigin}`,
      decision: "allow",
      reasons: ["MerchantSpendPolicy-gated signer registered — leaks now cap-scoped to this merchant"],
      broadcast: true,
      createdAt: now,
    });
    return existing ? "renewed" : "provisioned";
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[BARET] sub-key ${existing ? "renewal" : "provisioning"} failed for ${merchantOrigin}:`, err);

    if (existing) {
      // Its mandate lapsed on-chain, so anything it signs would be rejected.
      // Stop using it: the merchant falls back to the admin key, the same
      // state as after a failed first-time setup.
      await setSubKeyStatus(existing.pubkey, "revoked");
      evictSubKey(existing.pubkey);
      const current = await readAllowance(allowanceId);
      if (current) {
        current.subKeyPubkey = "";
        current.updatedAt = Date.now();
        await writeAllowance(current);
      }
    }

    await appendHistory({
      type: "alert",
      accountPubkey: row.accountPubkey,
      signature: null,
      origin: merchantOrigin,
      summary: `Couldn't ${existing ? "renew" : "set up"} the on-chain spending cap for ${merchantOrigin}`,
      decision: "block",
      reasons: [
        `${reason}. Payments to this merchant use your wallet's admin key, with no on-chain cap, until you approve it again.`,
      ],
      broadcast: false,
      createdAt: Date.now(),
    });
    return "failed";
  }
}
