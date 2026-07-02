import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const cardVariants = cva("rounded-[var(--r-card)] bg-[var(--bg-card)] border border-[var(--line)]", {
  variants: {
    padding: {
      none: "",
      sm: "p-3",
      md: "p-4",
      lg: "p-6",
    },
    interactive: {
      true: "transition-colors duration-[var(--motion-fast)] ease-[var(--motion-curve)] cursor-pointer hover:border-[var(--line-strong)]",
    },
  },
  defaultVariants: { padding: "md" },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, padding, interactive, ...rest }, ref) => (
  <div ref={ref} className={cn(cardVariants({ padding, interactive }), className)} {...rest} />
));
Card.displayName = "Card";
