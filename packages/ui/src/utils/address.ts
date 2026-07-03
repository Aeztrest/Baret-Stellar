export interface ShortAddrOptions {
  lead?: number;
  tail?: number;
}

/** Truncates a Stellar address/pubkey for display: `GABC…WXYZ`. Falsy input renders as ". ". */
export function shortAddr(address: string | null | undefined, opts: ShortAddrOptions = {}): string {
  if (!address) return ". ";
  const { lead = 4, tail = 4 } = opts;
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
