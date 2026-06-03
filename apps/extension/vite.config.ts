import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./manifest.config";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    nodePolyfills({ include: ["buffer", "crypto"] }),
    crx({ manifest }),
  ],
  build: {
    outDir: mode === "firefox" ? "dist-firefox" : "dist",
    emptyOutDir: true,
    rollupOptions: {
      // Inpage script needs a STABLE filename so the content script can inject it
      // by name and so the manifest's web_accessible_resources line stays valid
      // across rebuilds. Without this, crxjs ships the raw .ts source path which
      // the browser can't execute (bare module specifiers don't resolve at runtime),
      // and our Wallet Standard registration silently fails.
      input: {
        inpage: resolve(__dirname, "src/inpage/index.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "inpage") return "inpage.js";
          return "assets/[name]-[hash].js";
        },
      },
    },
  },
  server: {
    port: 5181,
    strictPort: true,
    hmr: {
      port: 5182,
    },
  },
}));
