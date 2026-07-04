/**
 * ScrollVideoHero. a scroll-scrubbed cinematic set-piece.
 *
 * The video never autoplays; the user's scroll position IS the playhead.
 * Scroll down and the film advances, scroll up and it rewinds. a "scrub".
 * Use it ONCE, as the single cinematic moment; its power is in being rare.
 *
 * How it works (the 8 load-bearing details):
 *  1. A deliberately tall outer <section> (default 300vh) with a full-screen
 *     sticky panel pinned to the viewport, so the video scrubs across 3 screens.
 *  2. Framer Motion `useScroll({ target, offset:["start start","end end"] })`
 *     gives 0→1 progress across the section.
 *  3. A rAF lerp scrubs the playhead: currentTime eases toward progress*duration
 *     (`current += (target-current)*0.14`). never set directly, or it stutters.
 *     Guards: only seek when readyState≥1 and |diff|>0.006, clamp target to
 *     [0, duration-0.033], wrap the seek in try/catch.
 *  4. As a top opener the panel pins `top-0 h-[100dvh]` (the header floats over
 *     it transparently). Use `heightVh`/`className` if you embed it mid-page.
 *  5. `onLoadedData` nudges currentTime to 0.01 so the true first frame renders
 *     (no poster→frame pop on the first scroll).
 *  6. Captions (ReactNode) fade in sequence, each owning an equal window of
 *     [0.03, 0.97], with a small y-rise.
 *  7. Encode the clip all-keyframe (GOP=1) so every frame is instantly seekable
 *. see ASSET_PROMPTS.md §5 for the exact ffmpeg recipe.
 *  8. Desktop-only (mobile never downloads the heavy clip) and reduced-motion
 *     falls back to a static poster + stacked captions in normal flow.
 *
 * `videoClassName` overrides the <video> class. e.g. crop a baked-in generator
 * watermark: `absolute left-0 top-0 h-[118%] w-full object-cover object-top`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
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
  /**
   * Optional "Skip intro" pill. When set, a discreet button appears once the
   * user has scrubbed ~2% in and smooth-scrolls them past the runway to the
   * content below. It never changes the runway or the scrub itself.
   */
  skipLabel?: string;
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
  skipLabel,
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
  // While "Skip intro" is animating the clip to its end directly, the normal
  // scroll-linked lerp below stands down so the two don't fight over
  // currentTime (a fast, mostly-decelerating programmatic scroll can leave
  // framer-motion's scrollYProgress a hair short of 1, which would otherwise
  // fight the manual tween and leave the clip stuck mid-frame).
  const skippingRef = useRef(false);

  // rAF lerp scrubbing. the heart of the smoothness.
  useEffect(() => {
    if (!activeScrub) return;
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    let current = 0;
    const tick = () => {
      if (skippingRef.current) {
        current = v.currentTime;
        raf = requestAnimationFrame(tick);
        return;
      }
      const dur = v.duration || 0;
      if (dur > 0) {
        const raw = Math.min(1, Math.max(0, scrollYProgress.get()));
        // Complete the clip by HALF the runway and HOLD the final frame for the
        // whole second half. the meter is 100% long before the section unpins,
        // so even a fast/momentum scroll can't reach the next section while the
        // bar is still filling.
        const p = Math.min(1, raw / 0.5);
        const target = Math.min(p * dur, dur - 0.033);
        // Tight tracking (all-keyframe already smooths seeks) so the bar keeps
        // up with the scroll even on a fast flick. no lag at the transition.
        current += (target - current) * 0.32;
        if (v.readyState >= 1 && Math.abs(current - v.currentTime) > 0.006) {
          try {
            v.currentTime = current;
          } catch {
            /* seeking mid-decode can throw. ignore and retry next frame */
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

  // "Skip intro": visible only while the user is inside the runway (past ~2%,
  // before the very end) so it never covers the content below.
  const [showSkip, setShowSkip] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setShowSkip(Boolean(skipLabel) && v > 0.02 && v < 0.98);
  });
  // Plays the clip out to its last frame while the page scrolls past the
  // runway in lockstep, instead of jumping straight to the content below.
  // Both the scroll and the clip's currentTime are driven by our own rAF
  // tween rather than native scrollTo(behavior:"smooth") — the native
  // version can be silently cancelled/ignored by the browser (e.g. residual
  // wheel/trackpad input) and isn't guaranteed to actually finish, which
  // left the page stuck mid-runway. Fully owning the scroll guarantees it
  // lands on the next section every time.
  const skipIntro = () => {
    const el = sectionRef.current;
    const v = videoRef.current;
    if (!el || !v) return;
    const targetScrollY = el.offsetTop + el.offsetHeight - window.innerHeight + 1;
    const startScrollY = window.scrollY;
    const dur = v.duration || 0;
    const startVideoTime = v.currentTime;
    const targetVideoTime = dur > 0 ? dur - 0.033 : startVideoTime;
    const duration = 1400;
    const startTime = performance.now();
    const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    skippingRef.current = true;
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const e = easeInOutCubic(t);
      try {
        v.currentTime = startVideoTime + (targetVideoTime - startVideoTime) * e;
      } catch {
        /* seeking mid-decode can throw. ignore and retry next frame */
      }
      window.scrollTo(0, startScrollY + (targetScrollY - startScrollY) * e);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // A programmatic scroll rather than real wheel/touch input can leave
        // framer-motion's own scrollYProgress a hair short of 1 even once
        // we're sitting at targetScrollY (observed ~0.39 in practice, well
        // past a rounding error) — it resumes updating correctly on the next
        // real scroll, but until then the lerp above would use its stale
        // value and yank the clip back mid-frame the instant we hand control
        // back to it. Force it home.
        scrollYProgress.set(1);
        skippingRef.current = false;
      }
    };
    requestAnimationFrame(step);
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
        {/* light readability wash. keeps captions legible without dulling the footage */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/25" />

        {/* Drifting ash/ember motes so the panel still feels alive while the
            user hasn't started scrolling yet (the clip itself barely moves). */}
        <EmberParticles />

        {captions.map((c, i) => (
          <Caption key={i} progress={scrollYProgress} index={i} total={captions.length}>
            {c}
          </Caption>
        ))}

        {skipLabel && (
          <motion.button
            type="button"
            onClick={skipIntro}
            initial={false}
            animate={{ opacity: showSkip ? 1 : 0, y: showSkip ? 0 : 8 }}
            transition={{ duration: 0.25 }}
            style={{ pointerEvents: showSkip ? "auto" : "none" }}
            className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 text-white/60 transition-colors hover:text-white"
            tabIndex={showSkip ? 0 : -1}
          >
            <span className="flex h-5 w-3.5 items-start justify-center rounded-full border border-white/30 p-1">
              <motion.span
                className="h-1 w-1 rounded-full bg-current"
                animate={{ y: [0, 6, 0], opacity: [1, 0.25, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.15em]">{skipLabel}</span>
          </motion.button>
        )}
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

// Slow-drifting ash motes, purely decorative. Randomized once per mount so
// the panel doesn't feel dead while the user sits at the top of the runway.
function EmberParticles({ count = 18 }: { count?: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 1 + Math.random() * 2.5,
        duration: 9 + Math.random() * 10,
        delay: -Math.random() * 18,
        drift: (Math.random() - 0.5) * 60,
        peak: 0.15 + Math.random() * 0.35,
      })),
    [count],
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute bottom-0 rounded-full bg-white"
          style={{ left: `${p.left}%`, width: p.size, height: p.size }}
          animate={{ y: [0, -800], x: [0, p.drift], opacity: [0, p.peak, p.peak, 0] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </div>
  );
}
