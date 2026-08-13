import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    server: {
      deps: {
        // passkey-kit's `sac-sdk` (and passkey-kit-sdk) ship an unbuilt
        // `main: "src/index.ts"` — fine for Vite's own bundler (used for
        // `pnpm build`), but Vitest externalizes node_modules by default
        // and hands them to Node's loader directly, which can't execute a
        // raw .ts entry ("Unknown file extension '.ts'"). Force these
        // through Vite's transform pipeline instead.
        inline: [/passkey-kit/, /sac-sdk/],
      },
    },
  },
});
