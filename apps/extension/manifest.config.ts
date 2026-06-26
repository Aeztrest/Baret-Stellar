import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

/**
 * Single source of truth for the extension manifest.
 * Spec: docs/extension-architecture.md §2.
 *
 * Target switching: env.mode === "firefox" swaps fields where Firefox MV3
 * differs from Chrome MV3 (background.scripts vs service_worker, options_ui
 * vs options_page).
 */
export default defineManifest(({ mode }) => {
  const isFirefox = mode === "firefox";

  return {
    manifest_version: 3,
    name: "Baret — Smart Wallet",
    short_name: "Baret",
    version: pkg.version,
    description: "The hard hat for your Stellar wallet — every transaction simulated, explained, and blocked when dangerous.",

    icons: {
      "16":  "icons/16.png",
      "32":  "icons/32.png",
      "48":  "icons/48.png",
      "128": "icons/128.png",
    },

    action: {
      default_popup: "src/popup/index.html",
      default_icon: "icons/32.png",
    },

    ...(isFirefox
      ? { options_ui: { page: "src/options/index.html", open_in_tab: true } }
      : { options_page: "src/options/index.html" }),

    // Firefox 128+ supports `type: "module"` on background.scripts, matching
    // Chrome MV3 module service workers. Without this, the bundled background
    // bundle (which emits ES `import` statements) fails to load with
    // "import declarations may only appear at top level of a module".
    ...(isFirefox
      ? { background: { scripts: ["src/background/index.ts"], type: "module" as const } }
      : { background: { service_worker: "src/background/index.ts", type: "module" as const } }),

    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["src/content/index.ts"],
        run_at: "document_start",
        all_frames: false,
      },
    ],

    web_accessible_resources: [
      {
        // `inpage.js` is the stable entry the content script injects; the
        // wildcard covers every code-split chunk it imports (rollup splits
        // shared deps like @stellar/stellar-sdk into separate hashed files).
        // Without the wildcard, the browser denies the chunk fetch and
        // inpage silently fails to register the wallet provider.
        resources: ["inpage.js", "assets/*"],
        matches: ["<all_urls>"],
      },
    ],

    // `windows` is required for `browser.windows.create()` — opening the
    // BARET popup as a focused window when a dApp queues a sign or
    // connect request, so the user doesn't have to manually click the
    // extension icon. MV3 disallows programmatic `chrome.action.openPopup()`,
    // so we render the popup HTML inside a small popup-style window instead.
    permissions: ["storage", "alarms", "notifications", "windows"],

    host_permissions: [
      // Stellar testnet — Horizon classic + Soroban RPC + friendbot.
      "https://horizon-testnet.stellar.org/*",
      "https://soroban-testnet.stellar.org/*",
      "https://friendbot.stellar.org/*",
      // Stellar pubnet — Horizon + a public Soroban RPC.
      "https://horizon.stellar.org/*",
      "https://soroban-rpc.creit.tech/*",
      // x402 facilitator (Built-on-Stellar / Coinbase CDP).
      "https://www.x402.org/*",
      "https://x402.org/*",
      // Baret analyze server (dev + production placeholder).
      "http://localhost:8080/*",
    ],

    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },

    ...(isFirefox
      ? {
          browser_specific_settings: {
            gecko: {
              id: "baret@baret.dev",
              // 128.0 is the first release where MV3 background.scripts
              // supports `type: "module"`, which we require for the ES-module
              // background bundle.
              strict_min_version: "128.0",
              data_collection_permissions: { required: [] as never[] },
            },
          },
        }
      : {}),
  };
});
