/**
 * Pack the Chrome + Firefox extension builds into .zip artefacts that the
 * showcase serves from /apps/showcase/public/. Run as the final step of
 * `pnpm --filter @stellar-thorn/extension build` so the install page always
 * points to the latest build.
 *
 * Pure Node — no external deps. Uses the bundled `node:zlib` + a tiny ZIP
 * writer below so we don't drag in `archiver` or `jszip` just for this.
 */

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, crc32 } from "node:zlib";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const EXTENSION_ROOT = join(__dirname, "..");
const SHOWCASE_PUBLIC = join(EXTENSION_ROOT, "..", "showcase", "public");

const TARGETS = [
  { srcDir: "dist",         outName: "blackthorn-chrome.zip"  },
  { srcDir: "dist-firefox", outName: "blackthorn-firefox.zip" },
];

if (!existsSync(SHOWCASE_PUBLIC)) mkdirSync(SHOWCASE_PUBLIC, { recursive: true });

for (const { srcDir, outName } of TARGETS) {
  const srcAbs = join(EXTENSION_ROOT, srcDir);
  if (!existsSync(srcAbs)) {
    console.warn(`[pack-downloads] skipping ${outName} — ${srcDir} doesn't exist (run the matching build first).`);
    continue;
  }
  const zipBuffer = makeZip(srcAbs);
  const outPath = join(SHOWCASE_PUBLIC, outName);
  writeFileSync(outPath, zipBuffer);
  console.log(`[pack-downloads] wrote ${relative(EXTENSION_ROOT, outPath)} (${(zipBuffer.length / 1024).toFixed(1)} KB)`);
}

/* ────────── minimal ZIP writer (stored + DEFLATE entries) ────────── */

function makeZip(rootDir) {
  const entries = [];
  walk(rootDir, rootDir, entries);

  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.relPath, "utf8");
    const raw = e.data;
    const crc = crc32(raw) >>> 0;
    const compressed = deflateRawSync(raw);
    const useDeflate = compressed.length < raw.length;
    const method = useDeflate ? 8 : 0;
    const payload = useDeflate ? compressed : raw;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);    // local file header signature
    localHeader.writeUInt16LE(20, 4);             // version needed
    localHeader.writeUInt16LE(0, 6);              // flags
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10);             // mod time
    localHeader.writeUInt16LE(0x21, 12);          // mod date (jan 1 1980 ok)
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);             // extra length

    localChunks.push(localHeader, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);                 // version made by
    central.writeUInt16LE(20, 6);                 // version needed
    central.writeUInt16LE(0, 8);                  // flags
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralChunks.push(central, nameBuf);

    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const localPart = Buffer.concat(localChunks);
  const centralPart = Buffer.concat(centralChunks);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralPart.length, 12);
  end.writeUInt32LE(localPart.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localPart, centralPart, end]);
}

function walk(root, dir, out) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walk(root, abs, out);
    } else if (st.isFile()) {
      const relPath = relative(root, abs).split(/[\\/]+/g).join("/");
      out.push({ relPath, data: readFileSync(abs) });
    }
  }
}
