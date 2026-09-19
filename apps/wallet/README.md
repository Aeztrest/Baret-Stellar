# @stellar-thorn/wallet

A standalone **web** wallet (Vite + React 18): the fallback for people who can't install the extension, and a lighter demo of the same pre-sign guard. Not the main product; the browser extension is.

**Details:** [`docs/architecture/clients.md`](../../docs/architecture/clients.md) §3. **Status caveats:** [`docs/implementation-status.md`](../../docs/implementation-status.md) §5.

## Run

```bash
pnpm dev:wallet            # http://localhost:5180 ; /api/* proxied to http://localhost:8080
pnpm build:wallet          # tsc && vite build → dist/
pnpm --filter @stellar-thorn/wallet test        # vitest (crypto and message-verification helpers)
```

Env (Vite): `VITE_BARET_BASE_URL` (analyze server, default `/api`) and `VITE_BARET_API_KEY` (no default). Needs `packages/swig-guard` and `packages/baret-adapter` built first (`pnpm build:guard`, `pnpm --filter @stellar-thorn/wallet-adapter build`).

## How it works

- Keys: random Ed25519 `Keypair`, encrypted with the passphrase (PBKDF2-SHA256 + AES-GCM, same parameters as the extension) and stored in `localStorage` (`baret.wallet.v3`). Policy in `baret.policy.v1`, history in `baret.history.v1`.
- Sending: builds an XLM payment XDR, runs `TransactionGuard.evaluate()` against the analyze server, and only signs/submits when the policy allows.
- dApps connect through `@stellar-thorn/wallet-adapter`: the dApp opens `/connect` or `/sign` in a popup and talks to it with `postMessage`; the popup accepts messages only from `window.opener` (`src/lib/verified-message.ts`).

## Limits

- The smart-wallet address is a **placeholder** (the authority `G…` address); there is no smart-wallet contract, no x402 mandates and no sub-keys here (those live in the extension).
- Testnet only (`ACTIVE_NETWORK`). Passphrase minimum is 8 characters.
