import { defineConfig } from "tsup";

// The published package must run under plain Node and install from npm
// alone, so everything except @stellar/stellar-sdk is bundled into dist:
// - @stellar-thorn/swig-guard is a workspace package that is not published;
// - passkey-kit depends on sac-sdk, whose entry point is raw TypeScript that
//   Node refuses to load from node_modules.
// tsup bundles devDependencies and leaves `dependencies` external, which is
// why those three live in devDependencies.
export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/spend-policy.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  splitting: true,
  clean: true,
  sourcemap: false,
  dts: { resolve: true },
  // Bundled CommonJS dependencies call require() for Node built-ins.
  banner: {
    js: 'import { createRequire as __baretCreateRequire } from "node:module";\nconst require = __baretCreateRequire(import.meta.url);',
  },
});
