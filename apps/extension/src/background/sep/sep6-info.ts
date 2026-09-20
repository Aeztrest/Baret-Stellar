/**
 * SEP-6 `/info`: which assets an anchor can deposit and withdraw, and at what
 * fee. Public per the spec (no login), so it works before signing in.
 *
 * The answer is third-party JSON, so only the fields the UI shows are read and
 * malformed entries are dropped rather than trusted.
 */

import type { AnchorAssetInfo, AnchorDirectionInfo } from "@stellar-thorn/ext-protocol";
import { anchorJson, isRecord } from "./http.js";

const ASSET_CODE = /^[A-Za-z0-9]{1,12}$/;

export async function fetchSep6Info(
  transferServer: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<AnchorAssetInfo[]> {
  const base = transferServer.replace(/\/+$/, "");
  const body = await anchorJson({ url: `${base}/info`, fetchImpl: opts.fetchImpl });
  return parseSep6Info(body);
}

export function parseSep6Info(body: unknown): AnchorAssetInfo[] {
  if (!isRecord(body)) return [];
  const deposit = isRecord(body.deposit) ? body.deposit : {};
  const withdraw = isRecord(body.withdraw) ? body.withdraw : {};
  const codes = new Set([...Object.keys(deposit), ...Object.keys(withdraw)]);
  return [...codes]
    .filter((code) => ASSET_CODE.test(code))
    .sort()
    .map((code) => ({
      code,
      deposit: direction(deposit[code]),
      withdraw: direction(withdraw[code]),
    }))
    // An asset with no readable direction has nothing to show.
    .filter((a) => a.deposit !== null || a.withdraw !== null);
}

function direction(v: unknown): AnchorDirectionInfo | null {
  if (!isRecord(v) || typeof v.enabled !== "boolean") return null;
  const methods = Array.isArray(v.funding_methods)
    ? v.funding_methods
    : isRecord(v.types)
      ? Object.keys(v.types)
      : [];
  return {
    enabled: v.enabled,
    feePercent: typeof v.fee_percent === "number" && Number.isFinite(v.fee_percent) ? v.fee_percent : null,
    fundingMethods: methods.filter((m): m is string => typeof m === "string").slice(0, 10),
  };
}
