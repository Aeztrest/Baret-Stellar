# Baret: Extension Architecture

> How the browser extension is put together: the surfaces, who talks to whom, where keys live, what is persisted and
> how Chrome and Firefox builds differ. **Verified against the source on 2026-09-19.** Where a feature was designed but
> not built, this document says so and links [`implementation-status.md`](./implementation-status.md) (Turkish) instead of describing it as real.
> The system-wide picture is in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) (Turkish); the x402/sub-key behaviour is in [`x402-defense.md`](./x402-defense.md).

Rule: a change to the message bus, the storage schema or the manifest updates this file in the same PR.

---

## 1. Bird's-eye

```
 dApp / showcase page (untrusted JS)
   │  window.baretStellar.*     window.fetch (patched: 402 interceptor)
   ▼
 inpage/index.js   ── page MAIN world ──────────────────────────────────────────────
   │  window.postMessage  { __bx_ws: 1, kind: req|rsp|err, id, method, payload }
   ▼
 content/index.ts  ── ISOLATED world; overwrites payload.origin with the real window.location.origin
   │  browser.runtime.connect({ name: "bx-wallet-standard" })   Envelope { __bx: 1 }
   ▼
 background service worker  (src/background/index.ts)
   ├─ messaging/router.ts        dispatches by port name; rejects ports whose sender.id isn't this extension
   ├─ wallet-standard/handlers   ws.* + x402.review  (dApp facing)
   ├─ messaging/handlers.ts      wallet.* tx.* ledger.* policy.* history.* alerts.* sitePermissions.* anchor.* network.set
   ├─ state/{machine,store}      in-memory wallet phase + listeners
   ├─ crypto/*                   kdf, session (decrypted seed), hd, attempt-limiter, sub-key-cache
   ├─ db/*                       IndexedDB "baret" v4
   ├─ x402/*  swig/*             payment build/sign, smart wallet + sub-key on-chain calls
   ├─ rpc/{connection,monitor}   Horizon/Soroban clients, post-sign drift monitor
   └─ baret/analyze-client       POST /v1/analyze
   ▲
   │  browser.runtime.connect({ name: "bx-popup" | "bx-options" })
 popup (toolbar 360x600, or a popup-type window with ?window=1)     options page (full tab, HashRouter)
```

Security domains: (1) the service worker holds the decrypted seed **in memory only**; (2) popup/options are extension pages that talk to (1) over ports; (3) the content script lives in an isolated world;
(4) the inpage script shares the page's JS realm and is therefore untrusted input. Every domain crossing is a structured message; the secret never crosses (1).

---

## 2. Manifest and build

Source of truth: `apps/extension/manifest.config.ts` (crxjs `defineManifest`, one source, `mode === "firefox"` switches the differing fields). There are no hand-written `manifest.*.json` files.

| Field | Value |
|---|---|
| Name / version | `Baret Smart Wallet`, version from `package.json` |
| Action / options | popup `src/popup/index.html`; Chrome `options_page`, Firefox `options_ui` (`open_in_tab`) |
| Background | Chrome `service_worker` (module); Firefox `background.scripts` (module, needs Firefox ≥ 128) |
| Content script | `src/content/index.ts`, `<all_urls>`, `document_start`, `all_frames: false` (default isolated world) |
| Web-accessible | `inpage.js`, `assets/*` (the inpage entry has a **stable filename** so the content script can inject it; hashed chunks need the wildcard) |
| Permissions | `storage`, `alarms` (declared, currently **unused**), `notifications`, `windows` (opens the sign popup window) |
| Host permissions | Horizon + Soroban RPC (testnet and pubnet), friendbot, `x402.org`, `http://localhost:8080/*` |
| CSP (extension pages) | `script-src 'self'; object-src 'self';` |
| Firefox extra | `browser_specific_settings.gecko.id = baret@baret.dev`, `strict_min_version 128.0` |

Note: the hosted analyze server (`https://baret-stellar.onrender.com`) is **not** in `host_permissions`; the packaged build reaches it through the server's CORS headers (`apps/server/src/api/cors.ts`).

Build (`apps/extension/vite.config.ts`): React plugin + `vite-plugin-node-polyfills` (`buffer`, `crypto`) + `@crxjs/vite-plugin`. Extra rollup entry `inpage` → `inpage.js`. Output `dist/` (Chrome) and `dist-firefox/`.

```bash
pnpm --filter @stellar-thorn/extension dev            # vite, port 5181 (HMR 5182)
pnpm build:extension                                  # build:chrome + build:firefox + pack:downloads
pnpm --filter @stellar-thorn/extension test           # vitest (node env, fake-indexeddb)
```

`pack:downloads` (`scripts/pack-downloads.mjs`, dependency-free zip writer) writes `apps/showcase/public/baret-chrome.zip` and `baret-firefox.zip` for the `/install` page (git-ignored). Sideload `dist/` via `chrome://extensions` → Load unpacked;
Firefox: `about:debugging` → Load Temporary Add-on → `dist-firefox/manifest.json`. The browser API is always imported through `webextension-polyfill` (`import browser from "webextension-polyfill"`), never the `chrome` global.

---

## 3. Background service worker

### 3.1 Layout (actual)

```
src/background/
├── index.ts                       bootstrap: read keystore → phase "locked"|"uninitialized"; startRouter; startMonitorLifecycle;
│                                  opens the popup window when the phase becomes "signing"
├── state/{machine,store}.ts       WalletState reducer + subscribe()
├── messaging/{router,handlers}.ts port router + one handler per ExtRpc method
├── wallet-standard/{handlers,sign-queue}.ts   dApp-facing handlers, pending sign queue
├── popup-window.ts                browser.windows.create({type:"popup"}) (one window; refocus if open)
├── crypto/{kdf,session,hd,attempt-limiter,sub-key-cache}.ts
├── db/{index,keystore,allowances,history,alerts,sub-keys,site-permissions}.ts
├── rpc/{connection,monitor}.ts
├── x402/{parse,build,handlers}.ts
├── swig/{provision,sub-keys,sub-key-lifecycle,smart-wallet-config}.ts   ("swig" is a legacy directory name; this is passkey-kit code)
├── sep/{anchors,toml,http,session,sep10-challenge,sep10-login,sep6-info,anchor-service}.ts   anchor allowlist, stellar.toml reader, guarded HTTP, in-memory login tokens,
│                                  SEP-10 recognizer + login, SEP-6 /info, the `anchor.*` handlers' logic (`fake-anchor.testutil.ts` is test-only)
└── baret/analyze-client.ts
```

### 3.2 Service-worker lifecycle (MV3)

The worker is not persistent. Module-level state (decrypted seed, sub-key cache, cached passphrase, pending sign queue, attempt-limiter counters, the 8-second monitor loop) **dies with the worker**. On the next wake `bootstrap()` rehydrates only
non-secret state from the keystore and sets the phase to `locked`, so a suspended worker means the user must unlock again. This is deliberate: key material must not be persisted just to survive worker restarts. There is no keep-alive alarm (`alarms` is declared but unused).

### 3.3 State machine

`WalletPhase`: `uninitialized` → `locked` → `ready` ⇄ `signing`. (`alert` exists in the type but is never dispatched.) `WalletState` also holds `network`, `walletAddress` (smart wallet, else authority), `authorityAddress`,
`alertsUnread`, `watchedAddresses`, `idleTimeoutMs` (fixed 15 min, not user-configurable), `accounts[]`, `activeAccountIndex`. Actions are the only mutation path (`wallet.created|unlocked|locked|reset`, `account.switched|updated`, `network.set`,
`sign.start|end`, `alerts.set|increment`, `watch.add|remove`, `activity.touch`). Only `state.changed` is pushed to surfaces.

---

## 4. Message bus

### 4.1 Ports

`router.ts` maps a port name to a handler table. Surface ports also receive `state.changed` pushes.

| Port name | From | Handlers |
|---|---|---|
| `bx-popup`, `bx-options` | popup / options pages (`shared/rpc.ts` `ExtRpcClient`, 15 s request timeout) | `messaging/handlers.ts` (`ExtRpc`) |
| `bx-wallet-standard` | content script (also the page overlay) | `wallet-standard/handlers.ts`: `ws.*` and `x402.review` |

There is no separate `bx-x402` port (an early design); the interceptor uses `bx-wallet-standard` with method `x402.review`. Ports opened by a context whose `sender.id` differs from `browser.runtime.id` are disconnected.

### 4.2 Envelope

```ts
type Envelope<M, P> = { __bx: 1; id: string; kind: "req" | "rsp" | "evt"; method: M; payload: P };
```

Errors are returned as `payload: { error: string }` on the `rsp`. Types live in `packages/ext-protocol/src/index.ts`; a new RPC starts there, and the `handlers` object is typed `{[M in ExtRpcMethod]: Handler<M>}`, so a missing handler does not compile.

### 4.3 RPC methods (popup/options ↔ background)

| Group | Methods |
|---|---|
| Lifecycle | `wallet.getState` `wallet.create` `wallet.import` `wallet.unlock` `wallet.lock` `wallet.reset` (needs token `"I-UNDERSTAND"`) `wallet.exportSecret` (`mnemonic`\|`base58`\|`hex`) `wallet.backupStatus` `wallet.acknowledgeBackup` |
| Funds | `wallet.balance` `wallet.airdrop` (Friendbot, testnet) `wallet.transferXlm` `wallet.addUsdcTrustline` `wallet.provisionSmartWallet` |
| Accounts | `wallet.listAccounts` `wallet.addAccount` `wallet.switchAccount` `wallet.renameAccount` |
| Signing | `tx.peekRequest` `tx.analyzeRequest` `tx.sign` (`tx.send` is **not implemented**) |
| Ledger | `ledger.list` `ledger.pause` `ledger.unpause` `ledger.revoke` |
| Policy | `policy.read` `policy.write` (validated by `swig-guard`'s `validatePolicy`; stored in `storage.local` `baret.policy.v1`; default `BALANCED_POLICY`) |
| History / alerts / sites | `history.list` `history.detail` `alerts.list` `alerts.dismiss` `sitePermissions.list` `sitePermissions.revoke` |
| Anchors | `anchor.list` (allow-listed anchors + whether the active account is signed in) `anchor.login` (`{domain}`; user-initiated) `anchor.info` (`{domain}`; SEP-6 `/info`, no login) |
| Network | `network.set` (`testnet` \| `pubnet`) |

`ExtEvents` also defines `alert.new`, `ledger.tick`, `tx.signRequest`, `tx.signed`, but **nothing emits them today**; surfaces poll (`usePolling`) instead.

### 4.4 dApp-facing methods (`ws.*`)

`ws.connect` `ws.disconnect` `ws.isConnected` `ws.getAddress` `ws.getNetwork` `ws.signTransaction` `ws.signAndSendTransaction` `ws.signAuthEntry` `ws.signMessage`, plus `x402.review`. `ws.connect` waits for unlock (opening the popup), checks the per-origin permission
(`site_permissions`), otherwise queues a `connect` request for the popup. Sign methods enqueue a `SignRequest` (`kind`: `message | transaction | transactionAndSend | authEntry | x402Payment | connect`) and resolve when the popup calls `tx.sign`.
`ws.signAuthEntry` first tries the silent x402 path (`tryAutoApproveX402AuthEntry`); see [`x402-defense.md`](./x402-defense.md) §4.

### 4.5 Origin handling

The inpage script can claim any `origin`. The content script **overwrites** `payload.origin` with the real `window.location.origin` (`content/trusted-origin.ts`, unit-tested) before forwarding, and everything downstream (site permissions, x402 merchant origin,
allowance keys) trusts only that value. The background never accepts a page-supplied origin.

---

## 5. Content script and inpage

- `content/index.ts` mounts a small Shadow-DOM overlay badge (`content/ui/*`, hideable per origin in `storage.local` `baret.overlayHidden.v1`), injects `inpage.js` as a `<script type="module">` and bridges the page to the background.
- `inpage/wallet-standard.ts` installs **`window.baretStellar`** (non-writable), a Freighter-compatible provider with `isConnected`, `requestAccess`, `getAddress`, `getNetwork`, `signTransaction`, `signAuthEntry`, `signMessage`, and fires `baret:walletReady`.
  Despite the file name it does **not** call Wallet Standard's `registerWallet`, and it does not expose `signAndSendTransaction`. dApps discover it by name (the showcase's `wallet/standard-bridge.ts`).
- `inpage/x402-interceptor.ts` patches `window.fetch`. On an HTTP 402 it reads `PaymentRequirements` from the `PAYMENT-REQUIRED` header (base64 JSON) or the JSON body (`accepts[0]` / `accepted`), asks the background (`x402.review`) and, on `approve`, replays the request with a `PAYMENT-SIGNATURE` header.
  On decline or error it returns the original 402. Requests made with `XMLHttpRequest` are **not** intercepted.
- Page ↔ content messages use the tag `__bx_ws` and the page's own origin as `postMessage` target; the bridge times out after 5 minutes.

---

## 6. Storage

### 6.1 IndexedDB `baret`, version 4 (`db/index.ts`)

| Store | Key | Notes |
|---|---|---|
| `keystore` | `id="primary"` | `{ blob (PBKDF2+AES-GCM), authorityPubkey, smartWalletAddress, accounts[], activeIndex, createdAt }`, mirrored to `storage.local` (`baret.keystore.backup.v1`) because Firefox temporary add-ons may wipe IDB on reload |
| `allowances` | `"<account>::<origin>::<asset>"` | indexes `merchantOrigin`, `status`, `accountPubkey`; `spendLog` drives the sliding-window caps |
| `history` | id | indexes `origin`, `createdAt`, `accountPubkey`; trimmed to 500 rows |
| `alerts` | id | indexes `createdAt`, `dismissedAt` (currently only `drift` alerts are created) |
| `sub_keys` | sub-key pubkey | encrypted sub-key secret, `status`, provisioning/revoke tx hashes; index `accountPubkey` |
| `site_permissions` | `"<account>::<origin>"` | `trusted\|denied`, `remembered` |
| `monitor`, `prefs` | - | created by migration v1, **unused** |

Migrations (`runMigrations`) are the only place an upgrade may happen. v4 scoped `allowances/history/sub_keys/site_permissions` per account; legacy allowances were forced back to `pending` and legacy site trust to `remembered:false` so an upgrade never grants
silent trust it can't attribute. Never call `indexedDB.open()` with another version elsewhere (deadlocks the cached connection).

### 6.2 `browser.storage.local`

`baret.policy.v1` (GuardPolicy), `baret.keystore.backup.v1`, `baret.backupAck.v1`, `baret.monitor.lastSeen.v1` (Horizon paging cursors), `baret.overlayHidden.v1`.

---

## 7. Key custody

- **Encryption:** Web Crypto only. `PBKDF2-SHA256`, **600,000** iterations (older blobs carry their own count and are re-encrypted at the current count on the next successful unlock), random 16-byte salt, `AES-GCM` with a 12-byte IV. The blob is self-describing (`EncryptedBlob`).
- **What is stored:** the 32-byte root seed. Account 0 is `Keypair.fromRawEd25519Seed(seed)` (byte-for-byte unchanged since before multi-account); accounts ≥ 1 use SEP-0005 paths `m/44'/148'/i'` derived from the seed's BIP-39 mnemonic (`crypto/hd.ts`). Exported mnemonic reproduces the same accounts in other wallets.
- **Session:** `crypto/session.ts` keeps the decrypted seed and derived keypairs in module memory. `useAuthority()` renews the idle timer; the unattended x402 path calls `useAuthority({ isAutomatic: true })`, which does **not**, so a page that keeps triggering auto-approved payments cannot keep a wallet unlocked forever. Locking zeroes the seed.
- **Brute-force limiter:** `crypto/attempt-limiter.ts` (unlock and export share the mechanism): 5 free failures, then exponential backoff capped at 5 minutes; in memory, per worker lifetime.
- **Sub-keys:** each merchant sub-key is a fresh Ed25519 keypair whose secret is encrypted under the **same passphrase** and stored in `sub_keys`. To use one later the worker needs the passphrase, so `crypto/sub-key-cache.ts` keeps it for **5 minutes** after unlock (strings can't be zeroed, so the TTL is the only mitigation); after that, sub-keys not already in the in-memory cache require an unlock. Sub-key provisioning is skipped (with a warning) when the passphrase is no longer cached.
- **Export / reset:** `wallet.exportSecret` re-asks the passphrase; `wallet.reset` requires the token and wipes the keystore and its mirror.

---

## 8. Smart wallet and sub-keys

- **Smart wallet** (`swig/provision.ts`): `wallet.provisionSmartWallet` deploys a real [passkey-kit](https://github.com/stellar/passkey-kit) smart-wallet instance from the canonical WASM hash in `swig/smart-wallet-config.ts`, with the account's existing Ed25519 authority as the first (unlimited, permanent) admin signer. No WebAuthn ceremony. The authority pays for the deploy (needs ≥ 5 XLM). The address is stored per account (`AccountEntry.smartWalletAddress`); provisioning is idempotent.
- **x402 payments come from the smart wallet** (`C…`), so it must hold the token (USDC SAC) balance. Classic sends from the UI (`wallet.transferXlm`) come from the authority `G…` account.
- **Merchant sub-keys** (`swig/sub-keys.ts`): on a manual approval of a merchant that has no live sub-key (the first approval, a renewal after the mandate lapsed, or a retry after a failure), `refreshSubKeyAfterApproval` in `swig/sub-key-lifecycle.ts` (a) installs `MerchantSpendPolicy` on the wallet as a `Policy` signer with an **empty** limits map (idempotent), (b) calls `MerchantSpendPolicy.set_allowance(wallet, merchant=payTo, signer=<new sub-key>, caps, mandate_seconds)`,
  (c) adds the sub-key as an `Ed25519` signer with `SignerLimits { token: [Policy(MerchantSpendPolicy)] }` in temporary storage with the mandate's expiry. From then on auto-approved payments to that merchant are signed by the sub-key through the wallet's own `__check_auth`, which calls the policy on-chain.
  `ledger.revoke` sends `remove_signer`. Failure of provisioning never blocks the payment (best-effort; the merchant then uses the admin key). Details, guarantees and the **known mandate-renewal gap**: [`x402-defense.md`](./x402-defense.md) §11 and [`implementation-status.md`](./implementation-status.md) §4.
- Contract addresses/hashes are constants in `swig/smart-wallet-config.ts` (must match `contracts/**/DEPLOYMENT.md`).

---

## 9. Analyze client and policy

`baret/analyze-client.ts` posts `{ network, transactionXdr, userWallet: authority G…, policy }` to `<base>/v1/analyze` (base: `https://baret-stellar.onrender.com` in packaged builds, `http://localhost:8080` in dev), 45 s timeout (Render free cold start ≈ 32 s when measured), and normalises the
response to `allow | advisory | block`. It never throws: an unreachable server yields an `offline` advisory with the finding `ANALYZE_UNREACHABLE`. In that state the sign screen shows a **Retry** button and does not offer a one-click Sign: signing without a check needs the same 1.5 s press-and-hold as a Blocked override (`popup/SignRequest.tsx`). While the first analysis is slow the screen says the analyzer is waking up after 6 s. `ws.connect` also fires `warmUpAnalyzer()` (a `GET /health`, at most once per 5 minutes, failures ignored) so the hosted server is usually awake by the first sign prompt. Automatic x402 payments do not call the analyzer at all (see `LIMITATIONS.md`). The API key is hard-coded to the public demo key in `messaging/handlers.ts`. The server's `attestation` field is ignored (no client-side verification yet).

**SEP-10 challenges are decided before the server is asked.** `tx.analyzeRequest` first runs `sep/sep10-challenge.ts` on transaction payloads. A SEP-10 login challenge (sequence 0, first operation `manage_data("<domain> auth")` sourced from the logging-in account) looks like a harmless `manage_data` transaction to the analyze server, and so does a forged one carrying a payment or `account_merge`; the recognizer separates them. Anything challenge-shaped (an `… auth` first operation, or sequence 0) never reaches the server:

- **Blocked** (`SEP10_INVALID_CHALLENGE`, critical): non-zero sequence, any operation that isn't `manage_data`, no login entry first, expired or infinite timebounds, wrong operation sources, `web_auth_domain` not matching the anchor's auth endpoint host, no valid signature from the anchor's `SIGNING_KEY`, or a toml for another network. The finding's `details.rules` lists every violated rule. Structure, timebounds and signature come from the SDK's `WebAuth.readChallengeTx`; the operation-type rule, the toml key as authority and the account check are Baret's own.
- **Blocked** (`SEP10_ACCOUNT_MISMATCH`, high): the login is for an account other than the wallet's authority `G…` (muxed addresses are compared by their base account).
- **Caution** (`SEP10_UNVERIFIED_ANCHOR`, medium): structurally valid but the anchor can't be verified, either because its domain isn't on the allowlist (`sep/anchors.ts`, shipped list: `tr-mock-anchor.fly.dev`) or because its `stellar.toml` couldn't be read or has no `SIGNING_KEY`.
- **Allow**: valid and verified, with the text "signs you in, no funds move".

The domain is attacker-controlled (it is inside the XDR), so only allow-listed domains are ever contacted, and only for `https://<host>/.well-known/stellar.toml`: 8 s timeout, 100 KB cap, redirects refused, 5-minute in-memory cache, hostnames only (no ports, IPs or `localhost`). A domain off the list is never fetched. Fee-bump envelopes are not treated as challenges and go to the normal analysis. The check runs only on transaction requests from a dApp; sign requests for SEP-6 withdrawals and Baret's own anchor flows are separate work (`PLAN.md` T2.2 to T2.4).

**Signing in to an anchor (Options → Anchors).** `anchor.login` is a deliberate click, and it is the only place the wallet signs a challenge on its own. `sep/sep10-login.ts` reads the anchor's toml (allow-listed domain only), asks its `WEB_AUTH_ENDPOINT` for a challenge, runs the same recognizer as above and **refuses to sign unless the verdict is Allow** (so a forged, mis-keyed, wrong-account or wrong-network challenge is never signed). It then posts the signed challenge and keeps the returned JWT only if its `sub` is this account and it hasn't expired. The token lives in `sep/session.ts` (service-worker memory, keyed by account and domain), never in storage and never in a response to a surface; `lock()` clears it, and so does a worker restart. `anchor.info` reads the SEP-6 `/info` (public per the spec). Every anchor call goes through `sep/http.ts`: https only, no redirects, 15 s timeout, 256 KB cap, JSON only; the anchor's own error text is flattened and cut to 200 characters before it is shown. There is no polling and no `alarms` use: SEP-6 status calls need the token, and the token can't outlive the worker (see `PLAN.md` T2.2).

The client-side policy is the saved `GuardPolicy` (default `BALANCED_POLICY`); the server evaluates its pre-sign subset and ignores the rest. The x402 rules (caps, allow-lists, mandate) are enforced **only here**. Which fields are actually enforced: [`policy-dsl.md`](./policy-dsl.md).

---

## 10. Post-sign monitor

`rpc/monitor.ts` polls Horizon every 8 s for new transactions on the authority and the smart wallet (paging cursors in `storage.local`), started/stopped from the wallet phase (and restarted on account switch). A successful transaction with no matching `history.signature` in the last 200 entries raises a
`drift` alert (IndexedDB + OS notification + unread badge). A failed transaction is recorded as an `alert` history row. It is polling, not a WebSocket stream, and there are no `verify_orphan`/`no_delivery` alerts.

---

## 11. Surfaces

- **Popup** (`src/popup`): `PopupApp` switches on the phase: `UninitializedScreen` (opens onboarding in a tab), `LockedScreen`, `SignRequest` or `ConnectApproval` (chosen by polling `tx.peekRequest` every 600 ms), otherwise the tabbed shell (Home / Activity / Allowances / Settings). When opened as a window for a request the background appends `?window=1`.
  `SignRequest` renders the verdict (Safe / Caution / Blocked; overriding a Blocked verdict needs a 1.5 s press-and-hold) and the mandate terms for x402 approvals.
- **Options** (`src/options`, `HashRouter`): `/onboarding` (8 steps: welcome, passphrase, generate/import, backup + quiz, fund, provision smart wallet, policy template, done), `/` Home, `/activity`, `/sites`, `/sites/:b64`, `/policies` (presets, toggles, raw JSON), `/x402` (console), `/settings` (network, export, reset). There is no standalone Allowances page in options.
- Both load the Google Fonts stylesheet from `fonts.googleapis.com` in their HTML (styles only; CSP restricts scripts).

---

## 12. Tests

`vitest` (node environment, `fake-indexeddb`), `src/**/*.test.ts`: crypto (kdf, hd, session, attempt-limiter, sub-key-cache), db (index/migrations, keystore, allowances, history), messaging (handlers, auth-entry analysis), wallet-standard handlers, x402 handlers, swig sub-keys, content trusted-origin.
There are no automated tests for popup/options React components or the inpage/content bridge; verify UI changes in a real browser build.

---

## 13. Security checklist (every PR that touches the extension)

- [ ] No `eval`, `new Function`, inline scripts (CSP), and no external script loads.
- [ ] No new host permission or `chrome.*` permission without a rationale in the PR.
- [ ] The decrypted seed / sub-key secrets are never logged, never sent over a port, never given to popup/content/inpage.
- [ ] Any new RPC that signs or moves funds requires an unlocked session and, where automatic, uses `useAuthority({ isAutomatic: true })`.
- [ ] Origins come from the content script's real origin, never from the page payload.
- [ ] Passphrase-checking RPCs go through the attempt limiter.

Store distribution (Chrome Web Store / AMO) is not done; the extension ships as an unpacked build and the `/install` zips. Code is never fetched and executed from a remote URL.
