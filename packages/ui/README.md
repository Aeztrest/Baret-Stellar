# @stellar-thorn/ui

Baret's shared design system for the extension, the web wallet and the showcase. **`src/tokens.css` is the single source of truth for the palette** (light-first, a maintained `.dark` set), and `src/brand/Mark.tsx` for the logo (the hard-hat mark).
Rules and rationale: [`docs/brand.md`](../../docs/brand.md). Where it sits in the dependency graph: [`docs/architecture/packages.md`](../../docs/architecture/packages.md).

| Path | Contents |
|---|---|
| `src/tokens.css` | Colour, type, radius, spacing tokens (import as `@stellar-thorn/ui/tokens.css` once per app) |
| `src/primitives/` | `Button`, `Badge`, `Card`, `Section`, `ListItem`, `EmptyState`, `Input`, `Dialog`, `Meter`, `StatTile`, `Verdict`, `CompareSplit` (class-variance-authority over the tokens) |
| `src/shadcn/` | Radix-based components with an `Sh` prefix (dialog, popover, tabs, table, tooltip, sonner toaster…) |
| `src/motion/` | `Reveal`, `SpotlightCard`, `ScrollVideoHero` |
| `src/layout/`, `src/theme/`, `src/lib/`, `src/hooks/`, `src/utils/` | Container/Eyebrow/PageSection, theme provider + toggle, portal context, `usePolling`, `shortAddr`, tone helpers |
| `src/brand/Mark.tsx` | The logo |

Usage: `import { Button, Verdict, Mark } from "@stellar-thorn/ui"`. The package ships TypeScript source (no build step) and targets React 18.

Notes: `baret_docs` cannot import this package (React 19 there) and mirrors the token values by hand; keep them in sync. In the extension's content script the tokens are re-scoped to a Shadow DOM (`content/ui/mount.tsx`).
New components must work in both light and dark themes and use tokens, not hard-coded colours.

```bash
pnpm --filter @stellar-thorn/ui typecheck
```
