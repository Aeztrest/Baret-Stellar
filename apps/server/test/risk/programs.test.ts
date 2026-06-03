import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { detectProgramFindings } from "../../src/risk/detectors/programs.js";
import { loadConfig } from "../../src/config/index.js";

describe("detectProgramFindings", () => {
  it("flags programs on risky list", () => {
    const risky = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const config = loadConfig({
      ...process.env,
      NODE_ENV: "test",
      RISKY_PROGRAM_IDS: risky.toBase58(),
    });
    const findings = detectProgramFindings([risky], config);
    expect(findings.some((f) => f.code === "RISKY_PROGRAM_INTERACTION")).toBe(true);
  });

  it("flags unknown programs when known-safe set is non-empty", () => {
    const token = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const random = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    const config = loadConfig({
      ...process.env,
      NODE_ENV: "test",
      KNOWN_SAFE_PROGRAM_IDS: token.toBase58(),
    });
    const findings = detectProgramFindings([random], config);
    expect(findings.some((f) => f.code === "UNKNOWN_PROGRAM_EXPOSURE")).toBe(true);
  });
});
