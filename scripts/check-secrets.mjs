#!/usr/bin/env node
/**
 * Secret scan (dependency-free). Run: `pnpm secrets:check`.
 *
 * Looks at every git-tracked text file for:
 *   1. Stellar secret seeds (`S…`, 56 chars). The StrKey checksum is verified,
 *      so an arbitrary base32 string that merely looks like a seed is ignored.
 *   2. Baret API keys (`baret_` + 20 or more letters/digits).
 *   3. PEM private key blocks.
 *
 * A finding is exempt only when the same line, or the line right above it,
 * contains `secret-scan: allow <reason>`. Use that for keys that are public
 * on purpose (for example the showcase's demo drainer identity) and say why.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ALLOW_MARKER = "secret-scan: allow";
const MAX_BYTES = 2 * 1024 * 1024;
const SKIP_FILE = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|Cargo\.lock)$|\.(png|jpe?g|webp|svg|ico|mp4|zip|woff2?|wasm)$/i;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function isStellarSecretSeed(candidate) {
  let bits = 0;
  let acc = 0;
  const bytes = [];
  for (const ch of candidate) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) return false;
    acc = ((acc << 5) | idx) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((acc >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  // version byte (18 << 3 = "S") + 32-byte key + CRC16-XModem (little endian)
  if (bytes.length !== 35 || bytes[0] !== 18 << 3) return false;
  let crc = 0;
  for (let i = 0; i < 33; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return bytes[33] === (crc & 0xff) && bytes[34] === crc >> 8;
}

const RULES = [
  {
    kind: "Stellar secret seed",
    find: (line) => [...line.matchAll(/\bS[A-Z2-7]{55}\b/g)].map((m) => m[0]).filter(isStellarSecretSeed),
  },
  {
    kind: "Baret API key",
    find: (line) => [...line.matchAll(/\bbaret_[A-Za-z0-9]{20,}\b/g)].map((m) => m[0]),
  },
  {
    kind: "PEM private key",
    // The returned label must not spell the header out: this file is scanned too.
    find: (line) => (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(line) ? ["PEM header"] : []),
  },
];

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString("utf8").split("\0").filter(Boolean);

const findings = [];
let scanned = 0;
for (const file of tracked) {
  if (SKIP_FILE.test(file)) continue;
  const abs = join(root, file);
  let size;
  try {
    size = statSync(abs).size;
  } catch {
    continue; // listed by git but deleted in the working tree
  }
  if (size > MAX_BYTES) continue;
  const buf = readFileSync(abs);
  if (buf.includes(0)) continue; // binary
  scanned++;
  const lines = buf.toString("utf8").split("\n");
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      for (const hit of rule.find(line)) {
        const allowed = line.includes(ALLOW_MARKER) || (i > 0 && lines[i - 1].includes(ALLOW_MARKER));
        if (!allowed) findings.push(`${file}:${i + 1}: ${rule.kind} (starts with ${hit.slice(0, 4)}…)`);
      }
    }
  });
}

if (findings.length) {
  console.error(`secrets:check found ${findings.length} possible secret(s):\n`);
  for (const f of findings) console.error("  - " + f);
  console.error(`\nIf a key is public on purpose, add a "${ALLOW_MARKER} <reason>" comment on the same or the previous line.`);
  process.exit(1);
}
console.log(`secrets:check OK (${scanned} tracked text files).`);
