import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Container } from "./Container";
import { Eyebrow } from "./Eyebrow";

/**
 * A full marketing section: consistent vertical padding, an optional top
 * border between stacked sections, and an `id` for in-page nav. Numbered
 * sections (01 … 08) read editorial and premium.
 */
export function PageSection({
  id,
  children,
  className,
  bordered = true,
  container = true,
  containerSize = "default",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  bordered?: boolean;
  container?: boolean;
  containerSize?: "default" | "wide";
}) {
  return (
    <section
      id={id}
      className={cn(
        "py-20 sm:py-28",
        bordered && "border-t border-border",
        className,
      )}
    >
      {container ? <Container size={containerSize}>{children}</Container> : children}
    </section>
  );
}

/**
 * Eyebrow + big uppercase display title + optional muted lead. Left-aligned
 * by default; `align="center"` for hero-style centering.
 */
export function SectionHeading({
  index,
  eyebrow,
  title,
  lead,
  align = "left",
  className,
}: {
  index?: string;
  eyebrow: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-5",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      <Eyebrow index={index} align={align}>
        {eyebrow}
      </Eyebrow>
      <h2 className="max-w-3xl text-balance font-display text-4xl font-semibold uppercase leading-[0.95] tracking-[-0.03em] text-foreground sm:text-5xl lg:text-[4rem]">
        {title}
      </h2>
      {lead && (
        <p
          className={cn(
            "max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg",
            align === "center" && "mx-auto",
          )}
        >
          {lead}
        </p>
      )}
    </div>
  );
}
