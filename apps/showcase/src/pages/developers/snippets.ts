import type { Policy } from "./api";

export type Lang = "curl" | "javascript" | "python" | "go";

export const LANGS: Array<{ id: Lang; label: string }> = [
  { id: "curl", label: "cURL" },
  { id: "javascript", label: "JavaScript" },
  { id: "python", label: "Python" },
  { id: "go", label: "Go" },
];

export type SnippetInput = {
  baseUrl: string;
  /** The real key, the masked form, or a placeholder: whatever should be printed. */
  key: string;
  network: string;
  xdr: string;
  userWallet: string | null;
  policy: Policy;
};

const indent = (s: string, n: number) =>
  s
    .split("\n")
    .map((l, i) => (i === 0 ? l : " ".repeat(n) + l))
    .join("\n");

/** JSON body as sent on the wire. */
export function requestBody(
  i: Pick<SnippetInput, "network" | "xdr" | "userWallet" | "policy">,
): Record<string, unknown> {
  return {
    network: i.network,
    transactionXdr: i.xdr,
    ...(i.userWallet ? { userWallet: i.userWallet } : {}),
    ...(Object.keys(i.policy).length ? { policy: i.policy } : {}),
  };
}

/** Python literal for a JSON value (true/false/None instead of true/false/null). */
function py(value: unknown, depth = 0): string {
  const pad = "    ".repeat(depth + 1);
  const end = "    ".repeat(depth);
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((v) => pad + py(v, depth + 1)).join(",\n")},\n${end}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${py(v, depth + 1)}`).join(",\n")},\n${end}}`;
}

export function buildSnippet(lang: Lang, i: SnippetInput): string {
  const body = requestBody(i);
  const pretty = JSON.stringify(body, null, 2);
  const url = `${i.baseUrl}/v1/analyze`;

  switch (lang) {
    case "curl":
      return `curl -X POST ${url} \\
  -H "Authorization: Bearer ${i.key}" \\
  -H "Content-Type: application/json" \\
  -d '${pretty.replace(/'/g, "'\\''")}'`;

    case "javascript":
      return `const res = await fetch("${url}", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${i.key}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${indent(pretty, 2)}),
});

if (!res.ok) {
  // Every error is { error: { code, message } }: switch on \`code\`.
  const { error } = await res.json();
  throw new Error(\`\${error.code}: \${error.message}\`);
}

const verdict = await res.json();
if (!verdict.safe) {
  console.warn("Blocked:", verdict.reasons);
} else {
  console.log(verdict.annotation.summary.humanReadable);
}`;

    case "python":
      return `import requests

res = requests.post(
    "${url}",
    headers={"Authorization": "Bearer ${i.key}"},
    json=${indent(py(body), 4)},
    timeout=30,
)

if not res.ok:
    # Every error is {"error": {"code", "message"}}: switch on \`code\`.
    err = res.json()["error"]
    raise RuntimeError(f"{err['code']}: {err['message']}")

verdict = res.json()
if not verdict["safe"]:
    print("Blocked:", verdict["reasons"])
else:
    print(verdict["annotation"]["summary"]["humanReadable"])`;

    case "go":
      return `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

func main() {
	body := []byte(\`${pretty}\`)

	req, _ := http.NewRequest("POST", "${url}", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer ${i.key}")
	req.Header.Set("Content-Type", "application/json")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer res.Body.Close()

	var out struct {
		Safe    bool     \`json:"safe"\`
		Reasons []string \`json:"reasons"\`
		Error   *struct {
			Code    string \`json:"code"\`
			Message string \`json:"message"\`
		} \`json:"error"\`
	}
	json.NewDecoder(res.Body).Decode(&out)

	if out.Error != nil {
		panic(out.Error.Code + ": " + out.Error.Message)
	}
	fmt.Println("safe:", out.Safe, out.Reasons)
}`;
  }
}

/** Compact one-liner used by the reference for "try it in a terminal". */
export function curlFor(opts: {
  method: string;
  path: string;
  baseUrl: string;
  key?: string | null;
  body?: unknown;
}): string {
  const parts = [`curl${opts.method === "GET" ? "" : ` -X ${opts.method}`} ${opts.baseUrl}${opts.path}`];
  if (opts.key) parts.push(`-H "Authorization: Bearer ${opts.key}"`);
  if (opts.body !== undefined) {
    parts.push(`-H "Content-Type: application/json"`);
    parts.push(`-d '${JSON.stringify(opts.body).replace(/'/g, "'\\''")}'`);
  }
  return parts.join(" \\\n  ");
}

/** Shows the start of a key and hides the rest. */
export function maskKey(key: string): string {
  return key.length <= 12 ? key : `${key.slice(0, 10)}${"•".repeat(12)}`;
}
