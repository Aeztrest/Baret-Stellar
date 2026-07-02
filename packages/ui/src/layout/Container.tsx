import type { ElementType, ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * One consistent max width with generous side padding — every marketing
 * section builds on this so vertical rhythm stays identical page to page.
 */
export function Container({
  children,
  className,
  as: Tag = "div",
  size = "default",
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  size?: "default" | "wide";
}) {
  return (
    <Tag
      className={cn(
        // One consistent max width, aligned to the site header/footer (max-w-6xl).
        "mx-auto w-full px-5 sm:px-8",
        "max-w-6xl",
        // `size` retained for API compatibility; both map to the aligned width.
        size === "wide" && "max-w-6xl",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
