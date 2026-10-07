// Repo-local runner for `baret limits …` under tsx (no build needed):
//   pnpm --filter @stellar-thorn/agent-guard spend-policy <command>
import { runLimitsCli } from "../src/limits-cli.js";

runLimitsCli(process.argv.slice(2)).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
