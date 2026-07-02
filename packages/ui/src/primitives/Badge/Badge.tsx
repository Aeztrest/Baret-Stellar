import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";
import { toneStyle, type Tone } from "../../utils/tone";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 font-bold uppercase tracking-wider whitespace-nowrap",
  {
    variants: {
      shape: {
        pill: "rounded-[var(--r-pill)]",
        rounded: "rounded-md",
      },
      size: {
        sm: "h-5 px-2 text-[10px]",
        md: "h-6 px-2.5 text-[11px]",
      },
    },
    defaultVariants: { shape: "pill", size: "sm" },
  },
);

export interface BadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "color">,
    VariantProps<typeof badgeVariants> {
  tone?: Tone;
  dot?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone = "neutral", shape, size, dot, style, children, ...rest }, ref) => {
    const t = toneStyle(tone);
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ shape, size }), className)}
        style={{ color: t.color, background: t.background, ...style }}
        {...rest}
      >
        {dot && (
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: t.dotColor }}
            aria-hidden
          />
        )}
        {children}
      </span>
    );
  },
);
Badge.displayName = "Badge";
