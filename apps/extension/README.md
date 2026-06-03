# @stellar-thorn/extension

The BLACKTHORN browser extension — Chrome MV3 + Firefox.

**Spec:** `docs/extension-architecture.md` (single source of truth)
**Wallet UX:** `docs/wallet-spec.md`
**Brand:** `docs/brand.md`

## Surfaces

| Path | Purpose | Spec section |
|---|---|---|
| `src/popup/` | 360×600 toolbar popup | wallet-spec §3 |
| `src/options/` | Full wallet (chrome:// route) | wallet-spec §7 |
| `src/background/` | Service worker (state, IndexedDB, monitor) | extension-architecture §3 |
| `src/content/` | Per-page content script | extension-architecture §5 |
| `src/inpage/` | In-page Wallet Standard provider + x402 interceptor | extension-architecture §6 |

## Build

```sh
pnpm dev                 # dev mode, writes to dist/
pnpm build:chrome        # production build with Chrome manifest
pnpm build:firefox       # production build with Firefox manifest
```

Sideload `dist/` via `chrome://extensions` (Developer mode → Load unpacked) for Chrome.
Run `web-ext run --source-dir=dist-firefox/` for Firefox.

## Status

Scaffold only. Implementation tasks T19–T29 fill in every surface. Each task
cites the spec section it implements.
