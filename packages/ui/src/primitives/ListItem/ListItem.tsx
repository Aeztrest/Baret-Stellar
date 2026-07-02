import { forwardRef } from "react";
import type { HTMLAttributes, MouseEventHandler, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface ListItemProps extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "onClick"> {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  interactive?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement | HTMLDivElement>;
}

export const ListItem = forwardRef<HTMLDivElement, ListItemProps>(
  ({ className, leading, title, subtitle, trailing, interactive, onClick, ...rest }, ref) => {
    const content = (
      <>
        {leading && <span className="shrink-0 flex items-center justify-center">{leading}</span>}
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-[var(--text)] truncate">{title}</span>
          {subtitle && (
            <span className="block text-xs text-[var(--text-muted)] truncate mt-0.5">{subtitle}</span>
          )}
        </span>
        {trailing && <span className="shrink-0 flex items-center">{trailing}</span>}
      </>
    );

    const classes = cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-input)]",
      (interactive || onClick) &&
        "cursor-pointer transition-colors duration-[var(--motion-fast)] hover:bg-[var(--bg-elevated)]",
      className,
    );

    if (onClick) {
      return (
        <button type="button" className={cn(classes, "w-full text-left")} onClick={onClick}>
          {content}
        </button>
      );
    }

    return (
      <div ref={ref} className={classes} {...rest}>
        {content}
      </div>
    );
  },
);
ListItem.displayName = "ListItem";
