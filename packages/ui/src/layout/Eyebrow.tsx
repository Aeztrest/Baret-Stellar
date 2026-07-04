import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * The signature section marker: a mono, wide-tracked, uppercase label led by
 * a tabular accent index and a short orange tick line. This is the one place
 * (besides primary actions and the Meter) the brand accent is allowed to
 * appear in body content. so it stays rare and reads as a deliberate signal.
 */
export function Eyebrow({
  index,
  children,
  className,
  align = "left",
}: {
  /** Two-digit section number, e.g. "03". */
  index?: string;
  children: ReactNode;
  className?: string;
  align?: "left" | "center";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground",
        align === "center" && "justify-center",
        className,
      )}
    >
      {index && <span className="text-primary tabular-nums">{index}</span>}
      <span aria-hidden className="h-px w-6 bg-primary" />
      <span>{children}</span>
    </div>
  );
}
