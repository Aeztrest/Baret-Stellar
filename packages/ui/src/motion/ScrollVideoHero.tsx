/**
 * ScrollVideoHero — a scroll-scrubbed cinematic set-piece.
 *
 * The video never autoplays; the user's scroll position IS the playhead.
 * Scroll down and the film advances, scroll up and it rewinds — a "scrub".
 * Use it ONCE, as the single cinematic moment; its power is in being rare.
 *
 * How it works (the 8 load-bearing details):
 *  1. A deliberately tall outer <section> (default 300vh) with a full-screen
 *     sticky panel pinned to the viewport, so the video scrubs across 3 screens.
 *  2. Framer Motion `useScroll({ target, offset:["start start","end end"] })`
 *     gives 0→1 progress across the section.
 *  3. A rAF lerp scrubs the playhead: currentTime eases toward progress*duration
 *     (`current += (target-current)*0.14`) — never set directly, or it stutters.
 *     Guards: only seek when readyState≥1 and |diff|>0.006, clamp target to
 *     [0, duration-0.033], wrap the seek in try/catch.
 *  4. As a top opener the panel pins `top-0 h-[100dvh]` (the header floats over
 *     it transparently). Use `heightVh`/`className` if you embed it mid-page.
 *  5. `onLoadedData` nudges currentTime to 0.01 so the true first frame renders
 *     (no poster→frame pop on the first scroll).
 *  6. Captions (ReactNode) fade in sequence, each owning an equal window of
 *     [0.03, 0.97], with a small y-rise.
 *  7. Encode the clip all-keyframe (GOP=1) so every frame is instantly seekable
 *     — see ASSET_PROMPTS.md §5 for the exact ffmpeg recipe.
 *  8. Desktop-only (mobile never downloads the heavy clip) and reduced-motion
 *     falls back to a static poster + stacked captions in normal flow.
 *
 * `videoClassName` overrides the <video> class — e.g. crop a baked-in generator
 * watermark: `absolute left-0 top-0 h-[118%] w-full object-cover object-top`.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { cn } from "../lib/cn";

export interface ScrollVideoHeroProps {
  /** All-keyframe H.264 mp4 (see ASSET_PROMPTS.md §5). Only fetched on desktop. */
  src: string;
  /** First-frame poster. Shown before the clip decodes + in fallbacks. */
  poster?: string;
  /** Captions revealed in sequence as you scrub (each a full ReactNode). */
  captions?: ReactNode[];
  /** Section height in vh (scroll runway). Default 300. */
  heightVh?: number;
  className?: string;
  /** Override the <video> element class (e.g. to crop a watermark). */
  videoClassName?: string;
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export function ScrollVideoHero({
  src,
  poster,
  captions = [],
  heightVh = 300,
  className,
  videoClassName,
}: ScrollVideoHeroProps) {
  const reduce = useReducedMotion();
  const desktop = useIsDesktop();
  const sectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const activeScrub = desktop && !reduce;

  // rAF lerp scrubbing — the heart of the smoothness.
  useEffect(() => {
    if (!activeScrub) return;
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    let current = 0;
    const tick = () => {
      const dur = v.duration || 0;
      if (dur > 0) {
        const raw = Math.min(1, Math.max(0, scrollYProgress.get()));
        // Complete the clip by HALF the runway and HOLD the final frame for the
        // whole second half — the meter is 100% long before the section unpins,
        // so even a fast/momentum scroll can't reach the next section while the
        // bar is still filling.
        const p = Math.min(1, raw / 0.5);
        const target = Math.min(p * dur, dur - 0.033);
        // Tight tracking (all-keyframe already smooths seeks) so the bar keeps
        // up with the scroll even on a fast flick — no lag at the transition.
        current += (target - current) * 0.32;
        if (v.readyState >= 1 && Math.abs(current - v.currentTime) > 0.006) {
          try {
            v.currentTime = current;
          } catch {
            /* seeking mid-decode can throw — ignore and retry next frame */
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeScrub, scrollYProgress]);

  const onLoadedData = () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.currentTime = 0.01; // render the true first frame
    } catch {
      /* ignore */
    }
  };

  // Fallback (mobile or reduced-motion): static poster + captions in flow.
  if (!activeScrub) {
    return (
      <section className={cn("dark relative bg-black px-5 py-16 sm:px-8", className)}>
        {poster && (
          <img src={poster} alt="" className="mx-auto mb-8 max-h-[50vh] w-full max-w-4xl rounded-2xl object-cover" />
        )}
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-10 text-center text-white">
          {captions.map((c, i) => (
            <div key={i}>{c}</div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} className={cn("relative hidden md:block", className)} style={{ height: `${heightVh}vh` }}>
      <div className="dark sticky top-0 h-[100dvh] overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          muted
          playsInline
          preload="auto"
          onLoadedData={onLoadedData}
          className={videoClassName ?? "absolute inset-0 h-full w-full object-cover"}
        />
        {/* light readability wash — keeps captions legible without dulling the footage */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/25" />

        {captions.map((c, i) => (
          <Caption key={i} progress={scrollYProgress} index={i} total={captions.length}>
            {c}
          </Caption>
        ))}
      </div>
    </section>
  );
}

function Caption({
  progress,
  index,
  total,
  children,
}: {
  progress: MotionValue<number>;
  index: number;
  total: number;
  children: ReactNode;
}) {
  // Captions live within the scrub window (video completes ~0.9); the last
  // one lands on the held final frame.
  const lo = 0.04;
  const hi = 0.92;
  const span = (hi - lo) / Math.max(1, total);
  const start = lo + index * span;
  const end = start + span;
  const fade = span * 0.28;
  const opacity = useTransform(progress, [start, start + fade, end - fade, end], [0, 1, 1, 0]);
  const y = useTransform(progress, [start, start + fade, end - fade, end], [28, 0, 0, -28]);

  return (
    <motion.div
      style={{ opacity, y }}
      className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white"
    >
      {children}
    </motion.div>
  );
}
