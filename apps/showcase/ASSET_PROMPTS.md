# Baret — Asset Catalogue & AI Generation Prompts

A page-by-page audit of every visual slot in the Baret frontend, with a
copy-paste AI prompt for each. Types: **IMG** (still), **ILLUS** (monochrome
line-art), **ILLUS-VID** (short looping line-art clip), **SCROLL-VID** (the
scroll-scrubbed cinematic hero).

> **Where files land:** `apps/showcase/public/` (filenames below are the exact
> paths the code references or expects). After generating, wire per the
> "Wire it" note under each asset.

---

## 0. The brand style block — PREFIX every IMAGE/ILLUS prompt

```
Design system: calm, premium, near-monochrome. Surfaces are warm off-white
(#FAF8F4 "bone") or warm near-black (#141414 "ink"). Exactly ONE accent color —
safety orange #FF6B00 — used sparingly for a single highlight, never more.
Industrial "construction safety" motif: hard hat, blueprint lines, gauge/meter
bars, technical schematic. 2026-modern, Linear/Vercel-grade restraint, generous
negative space, crisp thin strokes, subtle grain. Flat or line-art — not glossy
3D unless specified.
```

**Universal NEGATIVE prompt (append to every image):**
```
--no text, watermark, logo text, extra colors, teal, purple, blue, green,
rainbow, neon glow, cluttered, busy, low-contrast mush, stock-photo people,
gradient banding, jpeg artifacts, heavy drop shadows, skeuomorphic
```

**Palette:** bone `#FAF8F4` · ink `#141414` · orange `#FF6B00` · orange-soft
`#EA5E00` · muted grey `#6B6862`. Keep line-art on transparent/black so the DOM
supplies the single orange accent — the art itself stays monochrome.

**Tools:** stills → Midjourney v6 / DALL·E 3 / SDXL · line-art → SDXL + line-art
LoRA / MJ `--style raw` · video → Runway Gen-3 / Sora / Kling / Pika · upscale →
Magnific / Topaz · encode → ffmpeg.

---

## 1. Global / shared

### A1 · `og-cover.png` — social share card ★ referenced in `index.html`
- **Type IMG · 1200×630 · PNG.** Unfurls in Slack/X/LinkedIn/iMessage.
```
[style block] Wide hero on warm bone (#FAF8F4). Left two-thirds: generous empty
space for a headline. Right third: one minimalist orange (#FF6B00) hard-hat icon
as clean thin-line technical schematic, above a horizontal gauge bar that is
mostly ink (#141414) with a short orange segment at the left. Faint 4%-opacity
blueprint grid far behind. Editorial, calm. Flat vector line-art. 1200x630.
```
- **Wire it:** save to `public/og-cover.png` (already referenced by `og:image` /
  `twitter:image`). In Figma overlay the wordmark "BARET." + "Sign safe. Build on."
  top-left, keep AI output text-free.

### A2 · `icon-512.png` — maskable PWA icon (optional; favicon already ships)
- **Type IMG · 512×512 · PNG, maskable safe-zone.**
```
[style block] App icon 512x512, ink (#141414) rounded-square tile, centered
orange (#FF6B00) hard-hat glyph with a thin white center rib and short orange
brim. Flat, bold, legible at 16px. No text. Maskable safe padding.
```
- **Wire it:** `public/icon-512.png`, add to `public/site.webmanifest` icons.

---

## 2. Home — `/home` (`pages/HomePage.tsx`)

### A3–A5 · Three-pillar illustrations (`ThreePillars` section)
Monochrome line-art, one per pillar. Transparent PNG; the page blends them with
`dark:invert dark:mix-blend-screen`, keeping the orange accent in the DOM.
- **Type ILLUS · 800×800 · transparent PNG, single stroke weight, no fills, no color.**

**A3 `illus-guard.png` — Pre-sign Guard**
```
[style block] Monochrome technical line-art, single stroke weight, no color. A
magnifying glass inspecting a transaction receipt, a hard-hat resting on top.
Blueprint annotation ticks around the edges. Transparent bg. 800x800.
```
**A4 `illus-ledger.png` — Authorization Ledger**
```
[style block] Monochrome line-art. A stack of horizontal gauge/meter bars at
varying fill levels — a control panel of spend caps — tiny padlocks beside two
rows. Precise, single stroke weight. Transparent. 800x800.
```
**A5 `illus-monitor.png` — Post-sign Monitor**
```
[style block] Monochrome line-art. A radar/oscilloscope sweep over a grid, one
blip highlighted, a thin line connecting it to a small bell icon. Single stroke
weight. Transparent. 800x800.
```
- **Wire it:** in each `PillarCard`, add above the title:
  `<img src="/illus-guard.png" className="mb-4 h-24 w-24 opacity-80 dark:invert dark:mix-blend-screen" alt="" />`
  (optional — the cards read well without art; add if you want texture).

### A6 · `hero-scrub.mp4` + `hero-scrub.jpg` — the cinematic scroll set-piece ★
See **§5** for the full recipe. Already wired behind a flag in `HomePage.tsx`
(`CinematicScrub`, `SCRUB_ENABLED`). This is THE single cinematic moment — keep
it rare.

### A7 · `hero-mockup.png` (optional) — ambient product render
The hero already renders the REAL `SignRequest` component (best — stays truthful).
Only add this as an ambient render behind it.
- **Type IMG · 1000×1200 · transparent PNG.**
```
[style block] A single browser-extension wallet popup floating front-on, subtle
perspective. Ink-on-bone card, 1px orange top rule, a small gauge/meter bar
inside, a red "blocked" banner at the bottom. Matte, not glossy. Transparent bg.
```

---

## 3. Hub — `/` (`components/Hub.tsx`)

The Hub cards are intentionally typographic + interactive (SpotlightCard). Art is
OPTIONAL here; if you want it, generate per-scenario glyphs.

### A8 · Scenario glyphs (optional, 6×) — replace the lucide icon tiles
- **Type ILLUS · 240×240 · transparent PNG, single stroke, monochrome.**
```
[style block] Monochrome line-art glyph, single stroke weight, no color, for a
[DEX token swap | generative NFT mint | liquid-staking pool | airdrop gift |
token launch rocket | pay-per-question AI oracle]. Minimal, technical, centered.
Transparent bg. 240x240.
```
- **Wire it:** swap the `<site.icon>` lucide glyph for `<img>` in `SiteCard`
  (keep the neutral tile). Lucide icons are fine to keep — only do this for extra
  polish.

---

## 4. Demo dApp sites — `/novaswap` … `/launchpad` (`src/sites/*`)

These are deliberately LIGHT "third-party" sites (they impersonate real dApps).
A hero/product image per site makes each feel production-built. Colorful is OK
here — these are NOT Baret-branded, they're the sites Baret inspects.

### A9–A13 · Per-site hero images
- **Type IMG · 1200×600 · PNG (or transparent for product cutouts).**

**A9 `site-novaswap.png` (DeFi swap)**
```
A sleek modern DEX web-app hero: a token-swap widget with two token rows and a
big swap button, a subtle candlestick chart behind, deep-blue/violet fintech
palette, glassy cards. Clean product screenshot aesthetic, no real text. 1200x600.
```
**A10 `site-pixeldrop.png` (NFT mint)**
```
A generative-NFT mint page hero: a grid of colorful abstract "cyber phantom"
avatar artworks, a mint counter, neon-magenta/cyan palette. Trendy NFT drop
aesthetic, no real text. 1200x600.
```
**A11 `site-orbityield.png` (liquid staking)**
```
A liquid-staking dashboard hero: APY figure, a deposit card, an orbital/ring
motif, calm green-teal DeFi palette. Clean fintech product look, no real text.
1200x600.
```
**A12 `site-claimhub.png` (airdrop claim)**
```
An airdrop-claim page hero: a big "Claim" card with a gift/parachute motif,
confetti, friendly purple-blue palette. Web3 claim-site aesthetic, no real text.
1200x600.
```
**A13 `site-launchpad.png` (token launch)**
```
A token-launchpad hero: a countdown timer, a tokenomics donut chart, a rocket
motif, bold dark launch-site palette with lime accents. No real text. 1200x600.
```
- **Wire it:** each site component has a hero block — drop the image as a
  background/`<img>` at the top. (Optional polish; the sites already render.)

---

## 5. THE SCROLL-SCRUBBED HERO — `hero-scrub.mp4` (+ poster) ★★★

**Concept:** the video never autoplays. The user's scroll position IS the
playhead — scroll down, the film advances; scroll up, it rewinds. Component is
**already built and wired** (`packages/ui/src/motion/ScrollVideoHero.tsx`, used
by `HomePage.tsx`'s `CinematicScrub`). You only supply two files + flip a flag.

### 5.1 · Video prompt (Runway Gen-3 / Sora / Kling / Pika)
- **6 s, seamless, 1920×1080, muted.** Baret set-piece: "the firewall inspecting
  a signature", so each caption reveals a step of the Meter as you scroll.
```
Extreme-slow cinematic macro. In a dark near-black studio void, a single orange
(#FF6B00) hard hat rotates almost imperceptibly under one soft key light. Fine
dust motes drift. Thin blueprint grid lines project faintly on the surface behind
it. Over the shot, a subtle horizontal gauge bar fills left-to-right in orange as
the camera pushes in a hair. Monochrome except the orange hat + bar. Premium
product-film, no text, no people. Seamless loop.
```
- **Negative:** `text, logos, people, fast motion, neon, rainbow, glitch, jump cut`.

### 5.2 · Encode recipe — the WHOLE secret is all-keyframe (GOP=1)
Normal mp4s have sparse keyframes → `currentTime` snaps to the nearest one and
stutters. Make every frame a keyframe so any frame is instantly seekable:
```bash
ffmpeg -i source.mov -an -vf "scale=1920:-2,fps=30" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -g 1 -keyint_min 1 -sc_threshold 0 -crf 24 -movflags +faststart hero-scrub.mp4
```
`-g 1 -keyint_min 1 -sc_threshold 0` = every frame a keyframe. `-an` drops audio
(it's muted). `+faststart` starts fast. All-keyframe files are BIG, so keep the
clip short (3–6 s) and resolution reasonable — aim for a few MB.

Also export the first-frame poster:
```bash
ffmpeg -i hero-scrub.mp4 -vf "select=eq(n\,0)" -frames:v 1 hero-scrub.jpg
```

### 5.3 · Wire it (one line)
1. Drop `hero-scrub.mp4` + `hero-scrub.jpg` into `apps/showcase/public/`.
2. In `apps/showcase/src/pages/HomePage.tsx` set `const SCRUB_ENABLED = true;`.
Done. Captions live in `SCRUB_CAPTIONS` there (edit freely). The component handles
the 300vh runway, sticky `top-14` pin, rAF-lerp scrub, first-frame nudge, synced
captions, desktop-only fetch, and the reduced-motion static fallback.

---

## 6. Illustration micro-videos (optional alt to §2 stills) 🎬

Short silent looping line-art clips that fade in per section (pair with the
`Reveal` wrapper). Keep monochrome — orange lives in the DOM, not the clip.
- **Type ILLUS-VID · 3–4 s loop · 800×800 · transparent WebM (VP9+alpha) or black-bg mp4.**
```
Minimal monochrome line-art animation, single stroke weight, drawing itself on:
[a gauge/meter bar filling up | a radar sweep making one revolution | a magnifier
scanning a receipt]. Loops seamlessly. Black background, white lines only, no
color, no text. Calm, technical, 3 seconds.
```
- **Wire it:** `<video autoPlay muted loop playsInline className="dark:mix-blend-screen">`
  in the matching `PillarCard` (replaces the A3–A5 still).

---

## 7. Extension (popup + options) — empty-state illustrations (optional)

The extension ships its icons already. The only art worth adding is tiny empty-state
line-art (they render as `EmptyState`).
- **Type ILLUS · 120×120 · transparent PNG, monochrome, single stroke.**
```
[style block] Tiny monochrome line-art, single stroke, for an empty state:
[an empty ledger with a gauge at zero | a calm radar with no blips | an open
receipt tray]. Minimal, centered, transparent bg. 120x120.
```
- **Wire it:** pass as the `icon` of `<EmptyState>` in Allowances / Activity.

---

## Checklist after generating

- [ ] `og-cover.png` (1200×630) → verify unfurl at https://www.opengraph.xyz/
- [ ] Line-art illustrations transparent + correct in **both** themes (blend modes)
- [ ] `hero-scrub.mp4` encoded all-keyframe (`-g 1`), ≤ ~4 MB, `yuv420p`, muted → then `SCRUB_ENABLED = true`
- [ ] `hero-scrub.jpg` poster exported (frame 0)
- [ ] Every Baret asset keeps **one** orange accent — no second color crept in
- [ ] Demo-site heroes may be colorful (they're third-party); Baret surfaces stay monochrome + orange
