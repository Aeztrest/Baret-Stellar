/**
 * What the `anchor.*` RPC methods run: the wallet's active account, network
 * and signing key joined to the SEP-10 login and SEP-6 info clients.
 *
 * Login is user-initiated (a click in Options), so the challenge is signed
 * with `useAuthority()` and renews the idle timer like any other manual
 * signature. Baret never signs a challenge it hasn't verified (see
 * `sep10-login.ts`).
 */

import { TransactionBuilder } from "@stellar/stellar-sdk";
import type { AnchorAssetInfo, AnchorSummary } from "@stellar-thorn/ext-protocol";
import { isUnlocked, useAuthority } from "../crypto/session";
import { getNetworkPassphrase } from "../rpc/connection";
import { ANCHOR_ALLOWLIST } from "./anchors";
import { AnchorError } from "./http";
import { loginToAnchor, requireAllowedAnchor, requireAnchorToml } from "./sep10-login";
import { fetchSep6Info } from "./sep6-info";
import { getAnchorSession } from "./session";

export function listAnchors(): AnchorSummary[] {
  // A locked wallet has no account to be signed in as.
  const account = isUnlocked() ? useAuthority({ isAutomatic: true }).publicKey() : null;
  return ANCHOR_ALLOWLIST.map((domain) => {
    const session = account ? getAnchorSession(account, domain) : null;
    return { domain, loggedIn: session !== null, expiresAt: session?.expiresAt ?? null };
  });
}

export async function anchorLogin(
  domain: string,
): Promise<{ domain: string; account: string; expiresAt: number }> {
  const keypair = useAuthority();
  const passphrase = getNetworkPassphrase();
  const login = await loginToAnchor({
    domain,
    account: keypair.publicKey(),
    networkPassphrase: passphrase,
    signChallenge: (xdr) => {
      const tx = TransactionBuilder.fromXDR(xdr, passphrase);
      tx.sign(keypair);
      return tx.toEnvelope().toXDR("base64");
    },
  });
  return { domain: login.domain, account: login.account, expiresAt: login.expiresAt };
}

export async function anchorInfo(
  domain: string,
): Promise<{ domain: string; assets: AnchorAssetInfo[] }> {
  const host = requireAllowedAnchor(domain);
  const toml = await requireAnchorToml(host);
  if (!toml.transferServer) {
    throw new AnchorError("TOML_UNAVAILABLE", `${host} doesn't list a SEP-6 TRANSFER_SERVER.`);
  }
  return { domain: host, assets: await fetchSep6Info(toml.transferServer) };
}
