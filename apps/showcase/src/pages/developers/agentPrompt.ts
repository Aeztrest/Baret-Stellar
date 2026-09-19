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
};

/**
 * The prompt never contains a key. It tells the agent to read `BARET_API_KEY`
 * from its environment, so a key does not end up in a chat history.
 */
export function buildAgentPrompt({ apiUrl, network }: AgentPromptOptions): string {
  // split/join rather than replaceAll: this package's TS lib predates ES2021.
  const fill = (text: string, name: string, value: string) => text.split(`{{${name}}}`).join(value);
  let out = fill(template, "API_URL", apiUrl.replace(/\/$/, ""));
  out = fill(out, "NETWORK", network);
  return out.trim();
}

/** Rough size for the UI: about four characters per token. */
export const estimateTokens = (text: string) => Math.round(text.length / 4);
