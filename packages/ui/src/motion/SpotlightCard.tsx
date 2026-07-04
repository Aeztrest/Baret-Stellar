/**
 * SpotlightCard. an interactive surface with a cursor-tracked spotlight and a
 * border that lights up near the pointer. The glow is NEUTRAL (theme-aware
 * `--spotlight`, never the brand accent) so it reads as premium depth, not a
 * cheap colored bloom. Optional subtle 3D tilt. Respects reduced-motion.
 */
import { useRef, type ReactNode } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  type HTMLMotionProps,
} from "framer-motion";
import { cn } from "../lib/cn";

export interface SpotlightCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  /** Subtle cursor-driven 3D tilt. Default off. */
  tilt?: boolean;
  className?: string;
}

export function SpotlightCard({ children, className, tilt = false, ...rest }: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const mx = useMotionValue(-300);
  const my = useMotionValue(-300);
  const rx = useSpring(useMotionValue(0), { stiffness: 160, damping: 18 });
  const ry = useSpring(useMotionValue(0), { stiffness: 160, damping: 18 });

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    mx.set(x);
    my.set(y);
    if (tilt && !reduce) {
      ry.set((x / r.width - 0.5) * 6);
      rx.set(-(y / r.height - 0.5) * 6);
    }
  };
  const onLeave = () => {
    mx.set(-300);
    my.set(-300);
    rx.set(0);
    ry.set(0);
  };

  const fill = useMotionTemplate`radial-gradient(340px circle at ${mx}px ${my}px, var(--spotlight), transparent 60%)`;
  const ring = useMotionTemplate`radial-gradient(220px circle at ${mx}px ${my}px, var(--foreground), transparent 70%)`;

  return (
    <motion.div
      {...rest}
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={
        tilt && !reduce
          ? { rotateX: rx, rotateY: ry, transformPerspective: 900, transformStyle: "preserve-3d" }
          : undefined
      }
      className={cn(
        "group/spot relative overflow-hidden rounded-xl border border-border bg-card transition-colors",
        className,
      )}
    >
      {/* Border ring that lights up near the cursor (masked to a 1px frame). */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/spot:opacity-50"
        style={{
          background: ring,
          padding: 1,
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          maskComposite: "exclude",
        }}
      />
      {/* Soft fill glow under the content. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{ background: fill }}
      />
      <div className="relative" style={tilt && !reduce ? { transform: "translateZ(40px)" } : undefined}>
        {children}
      </div>
    </motion.div>
  );
}
