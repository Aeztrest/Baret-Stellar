import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    server: {
      deps: {
        // passkey-kit's `sac-sdk` ships an unbuilt `main: "src/index.ts"`
        // that Node's loader can't run; same workaround as
        // apps/extension/vitest.config.ts.
        inline: [/passkey-kit/, /sac-sdk/],
      },
    },
  },
});
