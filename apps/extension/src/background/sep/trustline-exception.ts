/**
 * Trustline exception for anchor assets.
 *
 * Strict policies block trustline changes and unlimited trustlines. That also
 * blocks the one trustline every anchor flow needs: the account opting in to
 * the asset the anchor pays out. This decides, before analysis, whether a
 * transaction's trustline changes are exactly that, so the caller can relax
 * those two flags for this one transaction instead of turning them off.
 *
 * Trusted means: adding a non-zero trustline, on the user's own account, for
 * an asset the wallet itself adds (canonical USDC for the network) or one an
 * allow-listed anchor declares in its `stellar.toml` `[[CURRENCIES]]`. A
 * removal, another account's trustline, a liquidity-pool share, or any asset
 * nobody vouches for keeps the normal rules.
 */

import { FeeBumpTransaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { ANCHOR_ALLOWLIST } from "./anchors.js";
import { baseAccount } from "./sep10-challenge.js";
import { fetchAnchorToml, type AnchorToml } from "./toml.js";

export interface TrustlineExceptionContext {
  passphrase: string;
  /** The wallet's `G…` account. */
  authority: string;
  /** The asset the wallet itself adds for this network. */
  canonical: { code: string; issuer: string };
  allowlist?: readonly string[];
  loadToml?: (domain: string) => Promise<AnchorToml>;
}

export interface TrustlineException {
  /** A line for the sign screen saying why this trustline is allowed. */
  note: string;
}

export async function trustlineException(
  xdrBase64: string,
  ctx: TrustlineExceptionContext,
): Promise<TrustlineException | null> {
  let parsed: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    parsed = TransactionBuilder.fromXDR(xdrBase64, ctx.passphrase);
  } catch {
    return null;
  }
  const tx = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed;

  const assets: { code: string; issuer: string }[] = [];
  for (const op of tx.operations) {
    if (op.type !== "changeTrust") continue;
    const line = op.line;
    if (!("code" in line) || !line.issuer) return null; // liquidity-pool share (or native)
    if (baseAccount(op.source ?? tx.source) !== ctx.authority) return null;
    if (Number(op.limit) === 0) return null; // removal
    assets.push({ code: line.code, issuer: line.issuer });
  }
  if (assets.length === 0) return null;

  const isCanonical = (a: { code: string; issuer: string }) =>
    a.code === ctx.canonical.code && a.issuer === ctx.canonical.issuer;

  // Only go to the network when something isn't the wallet's own asset.
  let declared: { code: string; issuer: string; domain: string }[] = [];
  if (!assets.every(isCanonical)) declared = await anchorCurrencies(ctx);

  const reasons = new Set<string>();
  for (const a of assets) {
    if (isCanonical(a)) {
      reasons.add(`${a.code} is the asset Baret adds itself`);
      continue;
    }
    const hit = declared.find((d) => d.code === a.code && d.issuer === a.issuer);
    if (!hit) return null;
    reasons.add(`${a.code} is declared by ${hit.domain}`);
  }
  const codes = [...new Set(assets.map((a) => a.code))].join(", ");
  return {
    note: `This adds a ${codes} trustline (${[...reasons].join("; ")}), so Baret didn't hold it to the strict trustline rules.`,
  };
}

async function anchorCurrencies(
  ctx: TrustlineExceptionContext,
): Promise<{ code: string; issuer: string; domain: string }[]> {
  const load = ctx.loadToml ?? ((d: string) => fetchAnchorToml(d));
  const domains = ctx.allowlist ?? ANCHOR_ALLOWLIST;
  const settled = await Promise.allSettled(domains.map(async (domain) => ({ domain, toml: await load(domain) })));
  return settled.flatMap((r) =>
    r.status === "fulfilled"
      ? (r.value.toml.currencies ?? []).map((c) => ({ ...c, domain: r.value.domain }))
      : [],
  );
}
