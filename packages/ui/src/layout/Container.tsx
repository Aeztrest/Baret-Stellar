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
        "mx-auto w-full px-5 sm:px-8",
        size === "wide" ? "max-w-6xl" : "max-w-5xl",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
