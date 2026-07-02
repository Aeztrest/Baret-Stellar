# Baret — AI Asset Generation Prompts

Text prompts for generating Baret's marketing imagery, illustrations, and scroll
videos with AI tools. Every prompt is tuned to the **locked brand identity** so
generated assets drop into the site without fighting the design system.

> **Where assets land:** put finished files in `apps/showcase/public/`. Filenames
> below are the exact paths the code already references (e.g. `og-cover.png`).

---

## 0. The brand style block — PREFIX every image prompt with this

```
Design system: calm, premium, near-monochrome. Surfaces are warm off-white
(#FAF8F4 "bone") or warm near-black (#141414 "ink"). Exactly ONE accent color —
safety orange #FF6B00 — used sparingly for a single highlight, never more.
Industrial "construction safety" motif: hard hat, blueprint lines, gauge/meter
bars, technical schematic. Style: 2026 modern, Linear/Vercel-grade restraint,
generous negative space, crisp thin strokes, subtle grain. No gradients-soup, no
neon, no rainbow. Flat or line-art, not glossy 3D render unless specified.
```

**Universal negative prompt (append to every image):**
```
--no text, watermark, logo text, extra colors, teal, purple, blue, green,
rainbow, neon glow, cluttered, busy, low-contrast mush, stock-photo people,
gradient banding, jpeg artifacts, drop shadows everywhere, skeuomorphic
```

**Palette hex reference:** bone `#FAF8F4` · ink `#141414` · orange `#FF6B00` ·
orange-soft `#EA5E00` · muted grey `#6B6862`.

---

## 1. `og-cover.png` — social share card  ★ referenced in `index.html`

- **Placement:** Open Graph + Twitter card (`<meta property="og:image">`). Shows in Slack/X/LinkedIn/iMessage unfurls.
- **Size:** 1200 × 630 px, PNG.
- **Tool:** Midjourney v6 / DALL·E 3 / SDXL (then hand-place the wordmark in Figma — keep AI text-free).
- **Prompt:**
```
[brand style block] A wide hero composition on a warm bone (#FAF8F4) background.
Left two-thirds: generous empty space for a headline. Right third: a single
minimalist orange (#FF6B00) hard-hat icon rendered as clean thin-line technical
schematic, sitting above a horizontal "meter" bar that is mostly ink (#141414)
with a short orange segment at the left — like a spending gauge. Faint blueprint
grid in the far background at 4% opacity. Editorial, calm, lots of whitespace.
Flat vector line-art. 1200x630.
```
- **After generating:** save as `apps/showcase/public/og-cover.png`. In Figma overlay the wordmark "BARET." (Space Grotesk, ink, orange full-stop) + tagline "Sign safe. Build on." top-left. Export flattened.

---

## 2. `hero-mockup.png` (optional) — a polished device/popup render

The hero currently renders the **real** SignRequest component (best — stays truthful).
Only generate this if you want an additional ambient render behind it.

- **Size:** 1000 × 1200 px, transparent PNG.
- **Prompt:**
```
[brand style block] A single browser-extension wallet popup floating in space,
front-on, subtle perspective. Clean ink-on-bone UI card with rounded corners, a
1px orange top rule, a small orange gauge/meter bar inside, and a red "blocked"
banner at the bottom. Soft ambient orange glow behind it at 12% opacity. Nothing
else in frame. Product render, matte not glossy, transparent background.
```
- **Save as** `apps/showcase/public/hero-mockup.png`.

---

## 3. Section illustrations — grayscale line-art (blend with `mix-blend-screen`)

Per the design system, section art is **monochrome line-art** so the single orange
accent stays special. Generate on transparent or pure-black background; the site
blends them with `dark:invert dark:mix-blend-screen`.

- **Size:** 800 × 800 px each, transparent PNG, pure ink line-art (no fills, no color).
- **Tool:** SDXL + "line art" LoRA, or Midjourney `--style raw`.

**3a. `illus-guard.png` — Pre-sign Guard**
```
[brand style block] Monochrome technical line-art, single weight strokes, no
color. A magnifying glass inspecting a transaction receipt, with a hard-hat
resting on top. Blueprint annotation ticks around the edges. Transparent
background. 800x800.
```

**3b. `illus-ledger.png` — Authorization Ledger**
```
[brand style block] Monochrome line-art. A stack of horizontal gauge/meter bars
of varying fill levels, like a control panel of spend caps, with tiny padlock
icons beside two rows. Technical, precise, single stroke weight. Transparent. 800x800.
```

**3c. `illus-monitor.png` — Post-sign Monitor**
```
[brand style block] Monochrome line-art. A radar/oscilloscope sweep over a grid,
one blip highlighted, connected by a thin line to a small bell icon. Blueprint
style, single stroke weight. Transparent. 800x800.
```

**Integration:** `<img className="opacity-80 dark:invert dark:mix-blend-screen" />`;
add a `text-primary` accent tick nearby (not inside the art) so orange stays rare.

---

## 4. `favicon` / app icon refresh (optional)

A crisp favicon already ships (inline SVG hard-hat). Only regenerate for a richer
maskable PWA icon.

- **Size:** 512 × 512 px, PNG, safe-zone aware (maskable).
- **Prompt:**
```
[brand style block] App icon, 512x512, ink (#141414) rounded-square tile,
centered orange (#FF6B00) hard-hat glyph with a thin white center rib and a short
orange brim. Flat, bold, legible at 16px. No text. Centered with maskable safe
padding.
```
- **Save as** `apps/showcase/public/icon-512.png` and add to `site.webmanifest`.

---

## 5. Scroll-scrubbed hero video (cinematic set-piece)  🎬

A background video whose playhead is driven by scroll progress (§8 of the design
brief). The component below is **ready to drop in** — you only need to supply the
`.mp4`.

### Video prompt (Runway Gen-3 / Sora / Kling / Pika)
- **Length:** 6–10 s, seamless loopable, 1920 × 1080, H.264 mp4, muted.
- **Prompt:**
```
Extreme slow, cinematic macro shot. A single orange (#FF6B00) hard hat slowly
rotating in a dark, near-black studio void, lit by one soft key light. Fine dust
motes drift. Thin blue-print grid lines subtly project onto the surface behind it.
Camera pushes in almost imperceptibly. Monochrome except the orange hat. Premium,
calm, product-film aesthetic, no text, no people. Seamless loop.
```
- **Negative:** `text, logos, people, fast motion, neon, rainbow, glitch, jump cut`.
- **Encode small:** `ffmpeg -i in.mp4 -vf scale=1920:-2 -c:v libx264 -crf 26 -pix_fmt yuv420p -an public/hero-scrub.mp4`
- **Save as** `apps/showcase/public/hero-scrub.mp4`.

### Drop-in component (already matches our motion rules — respects reduced-motion)
Create `apps/showcase/src/components/ScrollVideo.tsx`:
```tsx
import { useEffect, useRef } from "react";

/** Scrubs a muted video by the section's scroll progress, with a rAF lerp. */
export function ScrollVideo({ src, className }: { src: string; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const target = useRef(0);
  const current = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let raf = 0;
    const onScroll = () => {
      const el = wrap.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (window.innerHeight + r.height)));
      target.current = p;
    };
    const tick = () => {
      current.current += (target.current - current.current) * 0.1; // lerp
      const v = vid.current;
      if (v && v.duration) v.currentTime = current.current * v.duration;
      raf = requestAnimationFrame(tick);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div ref={wrap} className={className}>
      <video ref={vid} src={src} muted playsInline preload="auto" className="h-full w-full object-cover" />
    </div>
  );
}
```
Use it as a full-bleed hero backdrop with a bone/ink vignette overlay on top.

---

## 6. Illustration micro-videos for scroll reveals (optional) 🎬

Short, silent, looping line-art animations that fade in per section (pair with
`<Reveal>`). Keep them monochrome; the orange accent lives in the DOM, not the video.

- **Length:** 3–4 s loop, 800 × 800, transparent WebM (VP9 + alpha) or black-bg mp4.
- **Prompt (per section, reuse §3 subjects):**
```
Minimal monochrome line-art animation, single stroke weight, drawing itself on:
[a gauge/meter bar filling up | a radar sweep making one revolution | a magnifier
scanning a receipt]. Loop seamlessly. Black background, white lines only, no color,
no text. Calm, technical, 3 seconds.
```
- **Save as** `apps/showcase/public/anim-<name>.webm`; render with `<video autoPlay muted loop playsInline className="dark:mix-blend-screen">`.

---

## 7. Demo-dApp thumbnails (optional, for the Hub cards)

The Hub cards are currently clean typographic tiles (good). If you want tiny site
previews:

- **Size:** 640 × 400 px each, PNG.
- **Prompt (vary the subject):**
```
[brand style block] A tiny abstract UI thumbnail of a [DeFi swap | NFT mint |
liquid-staking | airdrop-claim | token-launch] web app, rendered as light
ink-on-bone wireframe blocks, one small orange accent element. Flat, minimal, no
real text (use grey placeholder bars). 640x400.
```
- Files: `thumb-novaswap.png`, `thumb-pixeldrop.png`, `thumb-orbityield.png`,
  `thumb-claimhub.png`, `thumb-launchpad.png`.

---

## Checklist after you generate

- [ ] `og-cover.png` (1200×630) → unfurls verified with https://www.opengraph.xyz/
- [ ] Line-art illustrations use transparent bg + look right in **both** themes (blend modes)
- [ ] `hero-scrub.mp4` encoded ≤ ~3 MB, `yuv420p`, muted
- [ ] Every asset keeps **one** orange accent — no second color crept in
- [ ] `icon-512.png` added to `site.webmanifest` if regenerated

**Tool cheat-sheet:** stills → Midjourney v6 / DALL·E 3 / SDXL · line-art → SDXL + line-art LoRA · video → Runway Gen-3 / Sora / Kling / Pika · upscale → Magnific / Topaz · encode → ffmpeg.
