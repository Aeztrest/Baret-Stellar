# BLACKTHORN — Extension Architecture

> The technical contract for the browser extension. How the four surfaces talk
> to each other, where the keys live, what runs in the page, what runs in the
> service worker, and how Chrome and Firefox stay in sync.

This file is binding. Any deviation from the message bus or IndexedDB schema
requires a PR that updates it here first.

---

## 1. Bird's-eye

```
   ┌─ User-facing surfaces ──────────────────┐
   │                                         │
   │  Popup           Options page           │
   │  (toolbar)       (chrome:// route)      │
   │     │                  │                │
   │     │  chrome.runtime  │                │
   │     │     .connect     │                │
   │     ▼                  ▼                │
   │  ┌──────────────────────────────┐       │
   │  │  Background Service Worker   │       │
   │  │  · WalletState machine       │       │
   │  │  · IndexedDB                 │       │
   │  │  · WebSocket monitor         │       │
   │  │  · Encrypted key custody     │       │
   │  │  · BLACKTHORN analyzer client│       │
   │  └─────────┬────────────────────┘       │
   │            │ chrome.runtime              │
   │            ▼                             │
   │  Content script (injected into page)    │
   │            │ window.postMessage          │
   │            ▼                             │
   │  Inpage provider (window.stellar,       │
   │  Wallet Standard registered)            │
   │            │                             │
   └────────────┼─────────────────────────────┘
                ▼
        dApp / page JS
```

Four security domains:
1. **Service worker** — isolated, persistent, holds decrypted authority in memory only.
2. **Popup / options** — extension-context React apps; can talk to service worker freely.
3. **Content script** — runs in *page* context but isolated world; cannot see page JS state.
4. **Inpage provider** — runs in page world; communicates with content script via `window.postMessage`.

The keypair never leaves domain (1). Every domain transition is a structured
message with origin checks.

---

## 2. Manifest layout (Chrome MV3)

```json
{
  "manifest_version": 3,
  "name": "BLACKTHORN — Smart Wallet",
  "short_name": "BLACKTHORN",
  "version": "0.1.0",
  "description": "The Stellar wallet that watches what happens after you sign.",
  "icons": {
    "16":  "icons/16.png",
    "32":  "icons/32.png",
    "48":  "icons/48.png",
    "128": "icons/128.png"
  },
  "action": {
    "default_popup": "popup/index.html",
    "default_icon": "icons/32.png"
  },
  "options_page": "options/index.html",
  "background": {
    "service_worker": "background/index.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/index.js"],
      "run_at": "document_start",
      "all_frames": false,
      "world": "ISOLATED"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["inpage/index.js"],
      "matches": ["<all_urls>"]
    }
  ],
  "permissions": [
    "storage",
    "alarms",
    "notifications"
  ],
  "host_permissions": [
    "https://horizon-testnet.stellar.org/*",
    "https://soroban-testnet.stellar.org/*",
    "https://horizon.stellar.org/*",
    "https://facilitator.payai.network/*"
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self';"
  }
}
```

### Notes per field

- **`service_worker.type: "module"`** — required for ESM imports of our shared `packages/swig-guard` bundle.
- **`content_scripts[].world: "ISOLATED"`** — keeps content script invisible to the page. The inpage provider runs in `MAIN` world via dynamic injection (see §6).
- **`web_accessible_resources`** — the inpage script must be reachable by URL so the content script can inject it as a `<script src=...>` tag.
- **`host_permissions`** — listed explicitly per Stellar endpoint (testnet Horizon + Soroban RPC, pubnet Horizon) and facilitator. Adding a custom RPC requires the user to grant a new origin via `chrome.permissions.request` (handled in advanced settings).
- **`permissions`**:
  - `storage` — `chrome.storage.local` for non-sensitive prefs (the encrypted secret lives in IndexedDB, not here).
  - `alarms` — periodic reconciliation with the chain (every 30 s when active).
  - `notifications` — drift / verify-orphan / large-tx push.
- We deliberately **do not** request `tabs`, `cookies`, `webRequest`, or `<all_urls>` host permissions. Content script `<all_urls>` is enough; we never read page DOM beyond the postMessage channel.

### Firefox variant

Firefox MV3 is mostly Chrome-compatible but has known divergences. We ship
two manifests, generated from a single source:

- `manifest.chrome.json` — as above.
- `manifest.firefox.json` — adds `browser_specific_settings.gecko.id` (`"blackthorn@blackthorn.dev"`), uses `scripts` array (not `service_worker`) for the background page (Firefox falls back to event pages), and explicit `browser` namespace via `webextension-polyfill` at runtime.

Build pipeline (`@crxjs/vite-plugin` for Chrome; `web-ext` + manual copy for Firefox)
swaps the manifest at bundle time. Source code is one tree; only the manifest
differs.

---

## 3. Background service worker

The service worker is the single source of truth for state and the only place
the decrypted authority secret ever exists in memory.

### 3.1 Top-level structure

```
background/
├── index.ts            // entry — registers everything below
├── state/
│   ├── machine.ts      // WalletState reducer
│   ├── store.ts        // mutex around the reducer + listeners
│   └── persist.ts      // saves non-sensitive state to chrome.storage.local
├── crypto/
│   ├── keystore.ts     // load/decrypt/encrypt the authority
│   ├── session.ts      // in-memory session keypair + idle timeout
│   └── kdf.ts          // PBKDF2 + AES-GCM helpers
├── db/
│   ├── ledger.ts       // IndexedDB allowance ledger
│   ├── history.ts      // signed-tx history
│   └── alerts.ts       // drift / orphan / revoke incidents
├── rpc/
│   ├── connection.ts   // pooled Horizon + Soroban RPC clients with retry
│   ├── ws-monitor.ts   // Horizon event-stream subscriptions per address
│   └── reconcile.ts    // matches on-chain events with ledger
├── policy/
│   └── eval.ts         // re-exports @stellar-thorn/swig-guard evaluator
├── x402/
│   ├── interceptor.ts  // receives 402 events from content script
│   ├── builder.ts      // builds the payment tx
│   └── settle-watch.ts // monitors verify→settle→deliver lifecycle
├── messaging/
│   ├── router.ts       // dispatches incoming runtime messages
│   ├── handlers.ts     // one handler per protocol method
│   └── port-tracker.ts // tracks open ports from popup / content scripts
└── alarms/
    └── periodic.ts     // chrome.alarms callbacks (reconciliation tick)
```

Total budget for the service worker JS bundle: **≤ 350 KB minified**. Aggressive
tree-shaking; `@stellar/stellar-sdk` is pruned to only the imports we actually use.

### 3.2 Service worker lifecycle constraints

MV3 service workers are *not* persistent — Chrome shuts them down after ~30 s
of idle. We design around this:

- **No long-running timers** — replaced by `chrome.alarms` (which wakes the worker).
- **WebSocket subscriptions** — Chrome keeps the worker alive while there's an open WS connection, but only up to ~5 min default. We use `chrome.alarms.create('keepalive', { periodInMinutes: 0.4 })` to refresh the heartbeat *while* a sub-key has unhealed delta or the wallet was used in the last 30 min. After 30 min idle, monitoring pauses; on next user action, we replay missed ledgers from Horizon's payments/transactions endpoints for the address.
- **Ephemeral state** in module-level `let` rebuilds on wake from `chrome.storage.local` + IndexedDB.
- **The decrypted authority is never persisted.** On worker restart, the wallet drops to `locked` state and the user re-enters their passphrase.

This is deliberate: a wallet that always-on-decrypts is a wallet whose key
material lives in disk-backed memory. Freighter does this, we won't.

### 3.3 Idle timeout

User-configurable; default 15 min. `crypto/session.ts` zeroes the in-memory
keypair after that many minutes since the last sign, balance-fetch, or
unlock event. After expiry, every operation needing the secret prompts the
unlock screen.

---

## 4. Surfaces (popup, options) ↔ background message bus

### 4.1 Transport

Long-lived `chrome.runtime.connect` ports, one per surface tab. Messages are
JSON, structurally typed end-to-end via shared TypeScript in `packages/ext-protocol`.

### 4.2 Message envelope

```ts
type Envelope<T> = {
  __bx: 1;             // protocol tag
  id: string;          // correlation id
  kind: "req" | "rsp" | "evt";
  method: string;      // see §4.3
  payload: T;
};
```

Each request gets a single response. Events flow background → surface for
state pushes (alerts, ledger updates, settle confirmations).

### 4.3 Methods (RPC-style)

| Method | Request | Response | Notes |
|---|---|---|---|
| `wallet.getState` | — | `WalletState` | Full snapshot. Surface caches; subscribes for diffs. |
| `wallet.unlock` | `{ passphrase }` | `{ ok: true }` or `{ error }` | Decrypts the stored secret into session memory. |
| `wallet.lock` | — | `{ ok: true }` | Zeroes session secret. |
| `wallet.create` | `{ passphrase, network }` | `{ identity }` | Onboarding only; throws if wallet already exists. |
| `wallet.reset` | `{ confirmation }` | `{ ok: true }` | Wipes everything. |
| `wallet.exportSecret` | `{ passphrase, format }` | `{ secret }` | Format = `mnemonic` \| `secretSeed` \| `hex`. |
| `wallet.airdrop` | — | `{ hash, amountXlm }` | Friendbot (testnet only). |
| `tx.simulateWithGuard` | `{ envelopeXdr, mode }` | `GuardEvaluation` | Internal; called by sign flow. |
| `tx.sign` | `{ requestId, accept: boolean }` | `{ signed?, signature?, rejection? }` | Resolves the pending sign request. |
| `tx.send` | `{ tx }` | `{ signature }` | Wallet-initiated sends only. |
| `ledger.list` | `{ filter? }` | `Allowance[]` | Active grants. |
| `ledger.revoke` | `{ merchantOrigin }` | `{ requestId }` — opens sign for the on-chain rotation | |
| `ledger.pause` / `unpause` | `{ merchantOrigin }` | `{ ok }` | Local-only freeze. |
| `policy.read` | — | `GuardPolicy` | Current saved policy. |
| `policy.write` | `{ policy }` | `{ ok }` | After validation. |
| `history.list` | `{ filter? }` | `HistoryEntry[]` | |
| `history.detail` | `{ id }` | `HistoryEntry & analysis` | |
| `alerts.list` | — | `Alert[]` | Open alerts only by default. |
| `alerts.dismiss` | `{ id }` | `{ ok }` | |
| `network.set` | `{ network }` | `{ ok }` | `testnet` \| `pubnet`. |
| `monitor.subscribe` | `{ address }` | `{ ok }` | Background-managed; surfaces don't usually call this. |

Events (background → surface):

| Event | Payload |
|---|---|
| `state.changed` | partial WalletState diff |
| `alert.new` | `Alert` |
| `ledger.tick` | `{ merchantOrigin, hits, capRemaining }` (live counter updates) |
| `tx.signRequest` | `{ requestId, kind, summary }` (popup re-renders to Sign Request) |
| `tx.signed` | `{ id, signature }` (history append) |

### 4.4 Origin checks

Every incoming message's `sender.origin` is verified against the extension's
own origin (popup/options) or `null` for service worker self-tests. Content
script messages are dispatched through a separate channel (§5.2) and never
appear on the popup-options bus.

---

## 5. Content script

Runs in every page (configurable allowlist in advanced settings — by default
`<all_urls>`). Lives in an isolated world — cannot see the page's JS but
shares the DOM.

### 5.1 Responsibilities

1. **Inject the inpage provider** — `<script src="${chrome.runtime.getURL('inpage/index.js')}">` appended to `document.documentElement` at `document_start`. Removed from DOM after load.
2. **Forward Wallet Standard / Stellar provider calls** between page (via `window.postMessage`) and background (via `chrome.runtime.connect`).
3. **Intercept HTTP 402 responses** by patching `window.fetch` and `XMLHttpRequest.prototype.send` *in the inpage script* (the content script can't reach the page's fetch). Forward parsed `PaymentRequirements` to background for analysis + signing.

### 5.2 Channel

Two ports per page:

- `bx-wallet-standard` — Wallet Standard / Stellar provider calls (connect, signTransaction, etc.)
- `bx-x402` — payment intercepts

Each gets its own `chrome.runtime.connect` so the background can route them
to separate handlers without ambiguity.

### 5.3 Origin handling

The content script tags every outbound message with the page's origin
(`window.location.origin`). The background trusts this *only* because
content scripts run in an isolated world that the page JS cannot reach;
the page cannot forge a content-script message.

The inpage provider tags messages with the same origin via `window.location`
inside `MAIN` world; the content script verifies these match before forwarding.

---

## 6. Inpage provider

Runs in the page's main world (loaded via `web_accessible_resources`).

### 6.1 Wallet Standard registration

```ts
import { registerWallet, type Wallet } from "@wallet-standard/wallet";
import { createBlackthornWallet } from "./blackthorn-wallet";

const wallet: Wallet = createBlackthornWallet({
  name: "BLACKTHORN",
  icon: BRAND_ICON_DATA_URL,
  chains: ["stellar:testnet", "stellar:pubnet"],
  features: {
    "standard:connect":           { connect },
    "standard:disconnect":        { disconnect },
    "standard:events":            { on },
    "stellar:signTransaction":    { signTransaction },
    "stellar:signAndSendTransaction": { signAndSendTransaction },
    "stellar:signMessage":        { signMessage },
  },
});

registerWallet(wallet);
```

Wallet Standard is the convention every modern Stellar dApp expects. dApps
using the Stellar Wallet Standard will see "BLACKTHORN" in the picker the
moment our extension is installed — no integration on the dApp side.

### 6.2 Provider calls

Each feature method is a thin wrapper:

```ts
async function signTransaction(input: SignTransactionInput): Promise<SignTransactionOutput> {
  const reqId = newRequestId();
  window.postMessage(
    { __bx: 1, ch: "wallet-standard", id: reqId, method: "signTransaction", payload: serializeInput(input) },
    window.location.origin,
  );
  return await awaitResponse(reqId);
}
```

Responses arrive via `window.message` events posted by the content script.
Origin and `__bx` checked on every event.

### 6.3 x402 interceptor (also in inpage)

```ts
const origFetch = window.fetch;
window.fetch = async function blackthornFetch(input, init) {
  const res = await origFetch(input, init);
  if (res.status === 402) return await maybeHandle402(input, init, res);
  return res;
};

async function maybeHandle402(input, init, res) {
  const reqs = await parsePaymentRequirements(res);
  if (!reqs) return res;
  const decision = await postToContentScript({
    method: "x402.review",
    payload: { input, init, requirements: reqs },
  });
  if (decision.action === "decline") return res; // bubble 402 up
  // Inject the signed header and retry
  const headers = new Headers(init?.headers ?? {});
  headers.set("PAYMENT-SIGNATURE", decision.headerValue);
  return await origFetch(input, { ...init, headers });
}
```

The intercept is opt-in per-merchant on first encounter (we never silently
auto-pay an unfamiliar origin). After the first allowance is granted, the
flow can be configured for one-tap repeats up to the cap.

---

## 7. IndexedDB schema

Database name: `blackthorn`. Version: 1. Owned by the background script.

```
ObjectStores
────────────
keystore     pk=id (single row "primary")
  { id, ciphertext, salt, iv, kdf: { name, iterations, hash }, createdAt }

allowances   pk=id
  { id, merchantOrigin, asset, capPerTx, capPerHour, capPerDay,
    spentTx, spentHourTs, spentHour, spentDayTs, spentDay,
    hits, lastHitAt, expiresAt, status: 'active'|'paused'|'revoked',
    subKeyAddress, createdAt, updatedAt }
  index by merchantOrigin
  index by status

history      pk=id
  { id, type, hash, origin, summary, decision, reasons,
    findingsJson, estimatedChangesJson, broadcast, createdAt }
  index by origin
  index by createdAt

alerts       pk=id
  { id, severity, kind, merchantOrigin, hash?, body, createdAt, dismissedAt }
  index by createdAt
  index by dismissedAt

monitor      pk=address
  { address, lastLedger, lastHash, lastReconcileAt, watchUntil }

prefs        pk=key
  { key, value }   // network, idleTimeout, notifs, telemetry, customRpc, ...
```

### Migration policy

Every schema change ships with a `versionchange` upgrade in `db/migrations.ts`.
Old rows are migrated, never dropped. We never break existing wallets.

---

## 8. Key custody

### 8.1 Encryption

```
secretBytes = Keypair.random().rawSecretKey()    // 32-byte ed25519 seed
salt        = randomBytes(16)
iv          = randomBytes(12)
key         = PBKDF2(passphrase, salt, 100_000, SHA-256, 256-bit)
ciphertext  = AES-GCM(secretBytes, key, iv)
keystore.put({ id: 'primary', ciphertext, salt, iv,
               kdf: { name: 'PBKDF2', iterations: 100_000, hash: 'SHA-256' },
               createdAt: Date.now() })
```

### 8.2 In-memory session

When unlocked, the decrypted `secretBytes` lives in `crypto/session.ts` as a
module-level `Uint8Array`. Two events zero it (overwrite with zeros, drop the
reference):

- Idle timeout fires
- `wallet.lock` RPC called

The session never persists. The service worker waking up from sleep means
re-unlock.

### 8.3 Sub-keys (Soroban per-merchant)

Each merchant the user authorizes gets its own derived sub-key:

- For the primary authority, we generate a child signer scoped by a Soroban
  allowance (e.g. an XLM/asset spend cap per day and an allow-list of
  contract ids the sub-key may invoke).
- The sub-key's secret is itself encrypted under the same passphrase + a
  per-sub-key salt.
- Revoking a sub-key submits a Soroban transaction that zeroes the allowance;
  the local encrypted record is then deleted.

Sub-keys give us per-merchant blast-radius isolation without forcing the user
to manage N independent keypairs.

---

## 9. Build pipeline

### 9.1 Chrome

```
apps/extension/
├── manifest.chrome.json
├── manifest.firefox.json
├── public/icons/
├── src/
│   ├── popup/
│   ├── options/
│   ├── background/
│   ├── content/
│   ├── inpage/
│   └── shared/         // imports from packages/swig-guard, packages/ui
├── vite.config.ts      // @crxjs/vite-plugin + 5 entries
└── package.json
```

Vite produces:
- `dist/popup/index.html` + chunks
- `dist/options/index.html` + chunks
- `dist/background/index.js`
- `dist/content/index.js`
- `dist/inpage/index.js`
- `dist/manifest.json` (one of the two source manifests)
- `dist/icons/*`

`pnpm dev:extension` runs Vite in watch mode and writes to `dist/`. The user
sideloads `dist/` via `chrome://extensions` (Developer mode → Load unpacked).

### 9.2 Firefox

`pnpm build:extension --target=firefox` swaps the manifest, runs the same
Vite build (Firefox-compatible since we already use the polyfill), and writes
to `dist-firefox/`. `web-ext run --source-dir=dist-firefox/` launches a
sandboxed Firefox with the extension auto-installed.

### 9.3 Polyfill

`webextension-polyfill` is imported as `browser` in every entry. We never use
the `chrome` global directly; that lets the same code run on both browsers.

```ts
import browser from "webextension-polyfill";
const port = browser.runtime.connect({ name: "popup" });
```

### 9.4 Bundle splitting

Two bundles are large by nature: `@stellar/stellar-sdk` and the design
system. We extract them into a shared chunk that the service
worker, popup, and options page all import via dynamic `import()` so each
surface only pays for what it needs.

---

## 10. Testing strategy

- **Unit tests** for the policy evaluator, x402 validator, and crypto helpers (Vitest in `packages/swig-guard` + `packages/ext-protocol`).
- **Service-worker tests** via `@vitest/web-worker` (mocked `browser.runtime`).
- **Popup component tests** via React Testing Library against a mocked port.
- **End-to-end** via Playwright with a sideloaded extension build, against a local/testnet Horizon + Soroban RPC and a fake-x402 mock server (in `apps/showcase` x402 site).
- **Manual matrix** before each release: Chrome stable + Chrome canary + Firefox stable + Firefox developer edition.

---

## 11. Security checklist

Each PR that touches the extension must confirm:

- [ ] No `eval`, no `new Function`, no inline scripts (CSP enforced)
- [ ] No external script loads from untrusted origins
- [ ] No `<all_urls>` host permissions added
- [ ] No new chrome.* permission added without rationale in PR description
- [ ] Encrypted secret never written to `chrome.storage.local` or `localStorage`
- [ ] Decrypted secret never logged, never sent over message bus, never crossed into popup/content/inpage contexts
- [ ] Origin checked on every postMessage / runtime message
- [ ] No third-party SDK that registers its own service worker / content script

---

## 12. Updates and store distribution

For v1 hackathon delivery: unpacked dist + zip archive + `web-ext build`
output. Public store submission (Chrome Web Store, Firefox Add-ons) is a
post-v1 task — submission requires a production privacy policy, hosted
support page, and updated icons.

Self-update via store auto-update is the only delivery mechanism we plan to
support; we never fetch and run code at runtime from a remote URL.

---

*Last updated: 2026-05-09 · This document is the authoritative architecture for the BLACKTHORN extension. Every PR that adds a new surface, message, or storage entity updates this file first.*
