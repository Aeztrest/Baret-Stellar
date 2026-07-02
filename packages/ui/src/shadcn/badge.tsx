import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-muted-foreground",
        ok: "border-transparent bg-[var(--ok-dim)] text-[var(--ok)]",
        warn: "border-transparent bg-[var(--warn-dim)] text-[var(--warn)]",
        bad: "border-transparent bg-[var(--bad-dim)] text-[var(--bad)]",
        live: "border-transparent bg-[var(--live-dim)] text-[var(--live)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface ShBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function ShBadge({ className, variant, ...props }: ShBadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { ShBadge, badgeVariants };
