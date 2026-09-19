# @stellar-thorn/wallet-adapter

(Directory `packages/baret-adapter`, package name `@stellar-thorn/wallet-adapter`.)

A small `postMessage` bridge that lets a dApp talk to the **standalone web wallet** (`apps/wallet`): it opens the wallet's `/connect` or `/sign` page in a popup, performs a handshake and returns the signed transaction XDR.
It has no runtime dependencies and does not touch the Stellar SDK; transport is base64 XDR strings.

**The browser extension does not use this package**; the extension exposes its own Freighter-compatible provider (`window.baretStellar`). The showcase lists the package as a dependency but does not import it.

```ts
import { BaretAdapter } from "@stellar-thorn/wallet-adapter";

const adapter = new BaretAdapter({ walletUrl: "http://localhost:5180", appName: "My dApp" });
const account = await adapter.connect();                       // { walletAddress, authorityAddress, smartWalletAddress }
const signedXdr = await adapter.signTransaction(unsignedXdr);
const { signature } = await adapter.signAndSendTransaction(unsignedXdr);   // also broadcasts through Horizon
```

## Protocol (`src/protocol.ts`)

All messages carry `__bt: "1"`. Popup → opener: `popup-ready`, `connect-approved`, `connect-rejected`, `sign-approved` (`signedTransactionXdr`, `signature?` when signed-and-sent), `sign-rejected` (`reason`, `analysisJson?`).
Opener → popup: `connect-request`, `sign-request` (`transactionXdr`, `mode: "sign" | "signAndSend"`). `newRequestId()` returns 32 random hex characters. The wallet accepts messages only from `window.opener`.
Default timeout 5 minutes.

```bash
pnpm --filter @stellar-thorn/wallet-adapter build    # tsc → dist/ (apps/wallet reads dist/)
pnpm --filter @stellar-thorn/wallet-adapter test
```

Every signature is still gated by the wallet's own pre-sign analysis; the adapter cannot bypass it.
