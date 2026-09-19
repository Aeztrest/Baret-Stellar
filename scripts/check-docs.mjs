#!/usr/bin/env node
/**
 * Documentation consistency check (dependency-free). Run: `pnpm docs:check`.
 *
 * It verifies the cheap, mechanical things that rot first:
 *   1. relative Markdown links point at files that exist,
 *   2. repo paths written in `backticks` (apps/…, packages/…, contracts/…, docs/…) exist,
 *   3. every env var the server reads is mentioned in docs/architecture/server.md,
 *   4. every workspace package is mentioned in ARCHITECTURE.md,
 *   5. every apps/* and packages/* directory has a README.md,
 *   6. every docs/*.md is listed in docs/README.md.
 *
 * It cannot tell whether a sentence is still true. The code ↔ doc table in
 * docs/README.md and the protocol in AGENTS.md cover that part.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "dist-firefox", ".next", "target", ".claude", "coverage", "test_snapshots"]);
// Files that are third-party or historical and are not ours to police.
const SKIP_FILES = new Set(["baret_docs/CHANGELOG.md", "baret_docs/LICENSE.md"]);
// Paths that are legitimately absent from a clean checkout (generated, ignored, or runtime).
const GENERATED = /(^|\/)(dist|dist-firefox|node_modules|target|\.next|data)(\/|$)|\.env(\.|$)|\.zip$|(^|\/)\.claude(\/|$)/;

const errors = [];
const fail = (file, msg) => errors.push(`${file}: ${msg}`);
const rel = (p) => relative(ROOT, p).split("\\").join("/");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

const mdFiles = walk(ROOT).filter((p) => !SKIP_FILES.has(rel(p)));

/** Removes fenced code blocks so links/paths inside examples are not checked. */
const stripFences = (s) => s.replace(/^(\s*)(```|~~~)[\s\S]*?^\1\2[^\n]*$/gm, "");

const REPO_PATH = /^(?:apps|packages|contracts|docs|baret_docs|scripts|\.github)\/[A-Za-z0-9_.@\-/]+$/;

for (const file of mdFiles) {
  const name = rel(file);
  const text = stripFences(readFileSync(file, "utf8"));

  // 1. relative links
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    let target = m[1];
    if (/^(https?:|mailto:|#|data:)/.test(target)) continue;
    target = target.split("#")[0].split("?")[0];
    if (!target) continue;
    const abs = resolve(dirname(file), decodeURI(target));
    if (!existsSync(abs) && !GENERATED.test(rel(abs))) fail(name, `broken link → ${m[1]}`);
  }

  // 2. backticked repo paths
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    let token = m[1].trim().replace(/[:#]\d+(?:[-–]\d+)?$/, "").replace(/[.,;]+$/, "");
    if (!REPO_PATH.test(token)) continue;
    if (GENERATED.test(token)) continue;
    if (!existsSync(join(ROOT, token))) fail(name, `path does not exist → ${token}`);
  }
}

// 3. server env vars
const serverDoc = readFileSync(join(ROOT, "docs/architecture/server.md"), "utf8");
const envNames = new Set();
const cfg = readFileSync(join(ROOT, "apps/server/src/config/index.ts"), "utf8");
for (const m of cfg.matchAll(/^\s{2}([A-Z][A-Z0-9_]{2,}):\s*z\./gm)) envNames.add(m[1]);
const srcDir = join(ROOT, "apps/server/src");
(function scan(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) scan(p);
    else if (n.endsWith(".ts")) {
      const s = readFileSync(p, "utf8");
      for (const m of s.matchAll(/\benv\.([A-Z][A-Z0-9_]{2,})\b/g)) envNames.add(m[1]);
    }
  }
})(srcDir);
for (const v of [...envNames].sort()) {
  if (!serverDoc.includes(v)) fail("docs/architecture/server.md", `env var not documented → ${v}`);
}

// 4. workspace packages and 5. READMEs
const arch = readFileSync(join(ROOT, "ARCHITECTURE.md"), "utf8");
for (const group of ["apps", "packages"]) {
  for (const dir of readdirSync(join(ROOT, group))) {
    const pkgPath = join(ROOT, group, dir, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (!arch.includes(pkg.name)) fail("ARCHITECTURE.md", `workspace package not mentioned → ${pkg.name} (${group}/${dir})`);
    if (!existsSync(join(ROOT, group, dir, "README.md"))) fail(`${group}/${dir}`, "missing README.md");
  }
}

// 6. docs index
const docsIndex = readFileSync(join(ROOT, "docs/README.md"), "utf8");
(function listDocs(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) listDocs(p);
    else if (n.endsWith(".md") && rel(p) !== "docs/README.md") {
      const fromDocs = relative(join(ROOT, "docs"), p).split("\\").join("/");
      if (!docsIndex.includes(fromDocs)) fail("docs/README.md", `doc not listed in the index → docs/${fromDocs}`);
    }
  }
})(join(ROOT, "docs"));

if (errors.length) {
  console.error(`docs:check found ${errors.length} problem(s):\n`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`docs:check OK (${mdFiles.length} markdown files, ${envNames.size} server env vars).`);
