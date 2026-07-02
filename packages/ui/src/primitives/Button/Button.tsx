import { forwardRef } from "react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-[var(--r-input)] font-semibold whitespace-nowrap transition-colors duration-[var(--motion-fast)] ease-[var(--motion-curve)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-45 disabled:pointer-events-none cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--accent)] text-white hover:bg-[var(--accent-soft)] focus-visible:ring-[var(--accent)] shadow-[0_2px_8px_-2px_rgba(255,107,0,0.4)]",
        secondary:
          "bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--line-strong)] hover:bg-[var(--bg)] focus-visible:ring-[var(--accent)]",
        ghost:
          "bg-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)] focus-visible:ring-[var(--accent)]",
        danger:
          "bg-[var(--bad)] text-white hover:brightness-95 focus-visible:ring-[var(--bad)]",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonOwnProps extends VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

type ButtonAsButton = ButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & { as?: "button" };
type ButtonAsAnchor = ButtonOwnProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> & { as: "a" };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  (
    { className, variant, size, fullWidth, loading, leftIcon, rightIcon, children, as = "button", ...rest },
    ref,
  ) => {
    const classes = cn(buttonVariants({ variant, size, fullWidth }), className);
    const content = (
      <>
        {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : leftIcon}
        <span className={loading ? "opacity-70" : undefined}>{children}</span>
        {!loading && rightIcon}
      </>
    );

    if (as === "a") {
      const anchorProps = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
      return (
        <a ref={ref as Ref<HTMLAnchorElement>} className={classes} {...anchorProps}>
          {content}
        </a>
      );
    }

    const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>;
    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type={buttonProps.type ?? "button"}
        className={classes}
        disabled={loading || buttonProps.disabled}
        {...buttonProps}
      >
        {content}
      </button>
    );
  },
);
Button.displayName = "Button";
