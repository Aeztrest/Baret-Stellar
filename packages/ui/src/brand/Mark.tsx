/**
 * BARET brand glyph.
 *
 * Authoritative SVG; never replaced by a raster. Stylized hard hat. orange
 * dome with a white center rib, resting on an orange brim. "The hard hat for
 * your Stellar wallet." Lockup spec lives in docs/brand.md §2.
 *
 * Renders in brand colors by default; pass `mono` to inherit `currentColor`
 * (for contexts that tint the mark, e.g. muted sidebars).
 */

import type { SVGProps } from "react";

export interface MarkProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
  /** Render single-color using currentColor instead of brand orange/white. */
  mono?: boolean;
}

export function Mark({ size = 24, mono = false, ...rest }: MarkProps) {
  const dome = mono ? "currentColor" : "#FF6B00";
  const rib  = mono ? "var(--bg-elevated, #fff)" : "#FFFFFF";
  const brim = mono ? "currentColor" : "#FF6B00";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="BARET"
      {...rest}
    >
      {/* Hard hat: dome (half-disc), center rib, brim */}
      <path d="M5 15.5a7 7 0 0 1 14 0Z" fill={dome} />
      <rect x="10.8" y="6.2" width="2.4" height="4.6" rx="1.2" fill={rib} />
      <rect x="3.2" y="16.2" width="17.6" height="2.4" rx="1.2" fill={brim} />
    </svg>
  );
}
