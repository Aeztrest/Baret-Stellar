/**
 * Inpage entry point. Runs in the page's MAIN world.
 *
 * Installs the Baret Stellar wallet provider as
 * `window.baretStellar` (Freighter-compatible API) and the x402 fetch
 * interceptor. dApps that already work with Stellar Wallets Kit can pick us
 * up by reading the provider; HTTP-402 traffic on the page is auto-routed
 * through Baret for policy review.
 */

import { installStellarWalletProvider } from "./wallet-standard";
import { installX402Interceptor } from "./x402-interceptor";

try {
  installStellarWalletProvider();
  console.info("[BARET] Stellar wallet provider installed");
} catch (err) {
  console.error("[BARET] wallet provider install failed:", err);
}

try {
  installX402Interceptor();
} catch (err) {
  console.error("[BARET] x402 interceptor failed:", err);
}
