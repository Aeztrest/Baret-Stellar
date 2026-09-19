# @stellar-thorn/showcase-ui

Small pieces shared by the showcase's demo dApps that are *not* part of the wallet's design system (`@stellar-thorn/ui`): demo-scenario concepts. Today it exports one component:

- `DangerModeToggle` (`checked`, `onChange`, `label`): the switch that swaps a demo site's payload for its attack scenario. Used by ClaimHub, LaunchPad and other demo sites.

Each demo site brings its own colours, logo and copy (`apps/showcase/src/components/SiteShell.tsx`); this package only holds what they genuinely share. TypeScript source, no build step.

```bash
pnpm --filter @stellar-thorn/showcase-ui typecheck
```

See [`docs/architecture/clients.md`](../../docs/architecture/clients.md) §1.3.
