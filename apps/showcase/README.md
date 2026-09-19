# @stellar-thorn/showcase

Baret's public site and demos: the landing page, seven demo dApps that hide real testnet attacks, the `/developers` API portal, `/agents` (agent guard), `/install` and `/docs`.
Vite + React 18 + `react-router-dom`, Tailwind 3 with `@stellar-thorn/ui` tokens.

**Routes, scenarios, how it talks to the server:** [`docs/architecture/clients.md`](../../docs/architecture/clients.md) §1-2. **Design briefs (history):** [`docs/showcase-briefs.md`](../../docs/showcase-briefs.md). **Asset catalogue:** [`ASSET_PROMPTS.md`](./ASSET_PROMPTS.md).

## Run

```bash
pnpm dev:showcase          # http://localhost:5175 ; /api/* is proxied to http://localhost:8080 (start pnpm dev:server too)
pnpm build:showcase        # tsc && vite build → dist/
pnpm --filter @stellar-thorn/showcase typecheck
```

The `/install` page serves `public/baret-chrome.zip` and `baret-firefox.zip`, which are generated (git-ignored) by `pnpm build:extension`.
The Scrybe and Cortex sites need the server started with `X402_MERCHANT_SECRET` (`pnpm --filter @stellar-thorn/server x402-setup`).

## Things to know

- Demo sites build **real, unsigned testnet transactions** (`src/baret/transactions.ts`) and hand them to the connected wallet. They never show a verdict themselves; that is the wallet's job.
- The wallet picker is deliberately brand-neutral (`src/wallet/WalletModal.tsx`); it lists `window.baretStellar` and Freighter.
- `/api` is same-origin: Vite proxy in dev, `vercel.json` rewrite to the Render server in production.
- **Tailwind gotcha:** classes like `bg-primary/10` on `var()`-based token colours compile to nothing. Use the `tint-*`, `glass-bg`, `hover-tint-*` helpers in `src/index.css`.
- When you add an API endpoint, update `src/pages/developers/endpoints.ts` (a server test compares it with the OpenAPI document).
- No automated UI tests; check both light and dark themes in a browser.
