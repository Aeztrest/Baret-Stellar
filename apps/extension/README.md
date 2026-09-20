# @stellar-thorn/extension

The Baret browser wallet: Chrome MV3 and Firefox (≥ 128). It reads every transaction before you sign it, keeps a per-merchant allowance ledger for x402 payments, and provisions on-chain spend-capped sub-keys on the user's smart wallet.

**Architecture:** [`docs/extension-architecture.md`](../../docs/extension-architecture.md) (message bus, storage, key custody, manifest). **x402 and sub-keys:** [`docs/x402-defense.md`](../../docs/x402-defense.md). **UX spec (with a status table):** [`docs/wallet-spec.md`](../../docs/wallet-spec.md).
**What is built vs. planned:** [`docs/implementation-status.md`](../../docs/implementation-status.md) §2.

## Surfaces

| Path | What |
|---|---|
| `src/background/` | Service worker: state, IndexedDB, crypto, x402, smart wallet/sub-keys, monitor, message router |
| `src/popup/` | Toolbar popup (360×600) and the sign/connect window: Home · Activity · Allowances · Settings, `SignRequest`, `ConnectApproval` |
| `src/options/` | Full wallet (HashRouter): onboarding, Home, Sites, Activity, Policies, x402 Console, Anchors, Settings |
| `src/content/` | Content script: injects the inpage script, bridges to the background, corner badge |
| `src/inpage/` | Page-world provider `window.baretStellar` (Freighter-compatible) and the `fetch` 402 interceptor |
| `src/shared/` | Typed RPC client and React context for popup/options |
| `manifest.config.ts` | The one manifest source (Chrome and Firefox variants) |

## Build and run

```bash
pnpm --filter @stellar-thorn/extension dev        # vite (dev server :5181)
pnpm build:extension                              # from the repo root: dist/ (Chrome), dist-firefox/, and zips → apps/showcase/public/
pnpm --filter @stellar-thorn/extension test       # vitest (background logic; no UI tests)
pnpm --filter @stellar-thorn/extension typecheck
```

Load `apps/extension/dist` via `chrome://extensions` → Developer mode → Load unpacked. Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `dist-firefox/manifest.json`.
Build `packages/swig-guard` first if `dist/` is missing (`pnpm build:guard`).

## Things to know

- Talks to the analyze server at `https://baret-stellar.onrender.com` (packaged) or `http://localhost:8080` (dev); see `src/background/baret/analyze-client.ts`. The API key is the public demo key, hard-coded in `messaging/handlers.ts`.
- A suspended MV3 worker locks the wallet again (the decrypted seed lives only in worker memory).
- New popup/options RPC: add it to `packages/ext-protocol` first, then to `background/messaging/handlers.ts`.
- `src/background/swig/` is passkey-kit smart-wallet code; "swig" is a legacy name. Contract addresses/hashes live in `swig/smart-wallet-config.ts`.
- UI has no automated tests; verify changes in a real browser build.
