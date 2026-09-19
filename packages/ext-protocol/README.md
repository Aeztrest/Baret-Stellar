# @stellar-thorn/ext-protocol

The single source of truth for messages between the extension's surfaces (background service worker, popup, options page, content script and the page-world provider). Types plus two tiny helpers (`newRequestId`, `isEnvelope`); no runtime dependencies, and **no build step**: `src/index.ts` is exported directly.

What is in `src/index.ts`:

- `Envelope` (`__bx: 1`, `id`, `kind: "req" | "rsp" | "evt"`, `method`, `payload`).
- `ExtRpc`: the popup/options ↔ background RPC registry (`wallet.*`, `tx.*`, `ledger.*`, `policy.*`, `history.*`, `alerts.*`, `sitePermissions.*`, `network.set`) with request/response types. The background's `handlers` object is typed from this, so a missing handler fails to compile.
- `ExtEvents` (only `state.changed` is emitted today), `ExtWalletStandardMethods` (`ws.*`) and `ExtX402Methods` (`x402.review`).
- Domain snapshots shared by the UI and the background: `WalletStateSnapshot`, `AccountSnapshot`, `AllowanceSnapshot`, `HistoryEntry`, `AlertEntry`, `AnalyzeResponse`, `X402MandatePreview`…

Adding an RPC: extend `ExtRpc` here, implement it in `apps/extension/src/background/messaging/handlers.ts`, call it via `useRpc()` from the UI, and update the method table in [`docs/extension-architecture.md`](../../docs/extension-architecture.md) §4.

```bash
pnpm --filter @stellar-thorn/ext-protocol typecheck
pnpm --filter @stellar-thorn/ext-protocol test
```
