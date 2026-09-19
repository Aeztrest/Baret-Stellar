import template from "./agent-prompt.md?raw";

/**
 * The prompt a person pastes into their AI agent (Claude, ChatGPT, Cursor, …)
 * so the agent wires Baret in front of its own wallet.
 *
 * The text lives in `agent-prompt.md` so it reads like the document it is.
 * Its two reference implementations are executed against a live server when
 * the prompt changes; `apps/server/test/api/portal-catalog.test.ts` checks
 * that every endpoint it names exists and that no real key is baked in.
 */

export type AgentPromptOptions = {
  /** Where the agent should call the API. */
  apiUrl: string;
  /** The network that server analyzes. */
  network: string;
  /** Include this key in the prompt. Omit to make the agent ask for one or create its own. */
  apiKey?: string | null;
};

function keySection(apiKey?: string | null): string {
  if (apiKey) {
    return [
      "## Your Baret key",
      "",
      `The human gave you this key: \`${apiKey}\``,
      "",
      "Store it in the wallet's secret store or in the environment variable `BARET_API_KEY` right away. Do not put it in source code, and do not repeat it in your replies or logs.",
    ].join("\n");
  }
  return [
    "## Your Baret key",
    "",
    "You were not given a key. Ask the human whether they already have one (it goes in the environment variable `BARET_API_KEY`). If they have none, create one yourself as described in the facts above.",
  ].join("\n");
}

export function buildAgentPrompt({ apiUrl, network, apiKey }: AgentPromptOptions): string {
  // split/join rather than replaceAll: this package's TS lib predates ES2021.
  const fill = (text: string, name: string, value: string) => text.split(`{{${name}}}`).join(value);
  let out = fill(template, "API_KEY_SECTION", keySection(apiKey));
  out = fill(out, "API_URL", apiUrl.replace(/\/$/, ""));
  out = fill(out, "NETWORK", network);
  return out.trim();
}

/** Rough size for the UI: about four characters per token. */
export const estimateTokens = (text: string) => Math.round(text.length / 4);
