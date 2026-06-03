/**
 * BLACKTHORN brand glyph.
 *
 * Authoritative SVG; never replaced by a raster. Stylized thorn — sharp triangle
 * resting on a horizontal base, suggesting both a leaf-tip and a shield bevel.
 * Lockup spec lives in docs/brand.md §2.
 */

import type { SVGProps } from "react";

export interface MarkProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

export function Mark({ size = 24, ...rest }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="BLACKTHORN"
      {...rest}
    >
      {/* Thorn: sharp triangle with a slight inward curve, base horizontal */}
      <path
        d="M12 2 L18.5 18 L5.5 18 Z"
        fill="currentColor"
      />
      <path
        d="M3 20 H21"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
