import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  size?: "sm" | "md";
  invalid?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  monospace?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, size = "md", invalid, prefix, suffix, monospace, disabled, ...rest }, ref) => {
    return (
      <div
        className={cn(
          "flex items-center gap-2 w-full rounded-[var(--r-input)] border bg-[var(--bg-elevated)] px-3.5 transition-colors duration-[var(--motion-fast)]",
          size === "sm" ? "h-9" : "h-11",
          invalid ? "border-[var(--bad)]" : "border-[var(--line-strong)] focus-within:border-[var(--accent)]",
          disabled && "opacity-50 pointer-events-none",
          className,
        )}
      >
        {prefix && <span className="shrink-0 text-[var(--text-faint)] flex items-center">{prefix}</span>}
        <input
          ref={ref}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn(
            "flex-1 min-w-0 bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--text-faint)]",
            size === "sm" ? "text-xs" : "text-sm",
            monospace && "font-mono",
          )}
          {...rest}
        />
        {suffix && <span className="shrink-0 text-[var(--text-faint)] flex items-center">{suffix}</span>}
      </div>
    );
  },
);
Input.displayName = "Input";
