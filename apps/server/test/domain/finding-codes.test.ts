import { describe, expect, it } from "vitest";
import { DETECTOR_CATALOG } from "../../src/domain/detector-catalog.js";
import {
  CLIENT_FINDING_CODES,
  RISK_FINDING_CODES,
} from "../../../../packages/swig-guard/src/types.js";

// The server does not depend on workspace packages, so its finding codes are
// mirrored by hand in swig-guard. This is the only thing that notices when
// one side changes and the other does not.
describe("finding codes: server catalog <-> swig-guard mirror", () => {
  const serverCodes = DETECTOR_CATALOG.map((d) => d.code as string);

  it("swig-guard lists exactly the codes the server can return", () => {
    const missingInSwigGuard = serverCodes.filter(
      (c) => !(RISK_FINDING_CODES as readonly string[]).includes(c),
    );
    const unknownToServer = (RISK_FINDING_CODES as readonly string[]).filter(
      (c) => !serverCodes.includes(c),
    );
    expect({ missingInSwigGuard, unknownToServer }).toEqual({
      missingInSwigGuard: [],
      unknownToServer: [],
    });
  });

  it("has no duplicate codes in the mirror", () => {
    expect(new Set(RISK_FINDING_CODES).size).toBe(RISK_FINDING_CODES.length);
  });

  it("keeps client-only codes out of the server's vocabulary", () => {
    const clashes = (CLIENT_FINDING_CODES as readonly string[]).filter((c) =>
      serverCodes.includes(c),
    );
    expect(clashes).toEqual([]);
  });
});
