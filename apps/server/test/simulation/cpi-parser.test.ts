import { describe, expect, it } from "vitest";
import { xdr } from "@stellar/stellar-sdk";
import type { Transaction } from "@stellar/stellar-sdk";
import { parseSorobanAuthTree } from "../../src/simulation/cpi-parser.js";

// Real tag value so our fake invocation duck-types as a `contractFn` node —
// the actual `Address`/`ScAddress` machinery isn't needed to test the
// depth/node safety cap, so the rest of the tree is hand-built plain
// objects rather than real Soroban XDR.
const CONTRACT_FN_TAG =
  xdr.SorobanAuthorizedFunctionType.sorobanAuthorizedFunctionTypeContractFn()
    .value;
const NON_ADDRESS_CREDENTIALS_TAG = -1;

function fakeFunction() {
  return {
    switch: () => ({ value: CONTRACT_FN_TAG }),
    contractFn: () => ({
      contractAddress: () => ({}),
      functionName: () => Buffer.from("fn"),
      args: () => [],
    }),
  };
}

function fakeCredentials() {
  return { switch: () => ({ value: NON_ADDRESS_CREDENTIALS_TAG }) };
}

/** A single chain of `depth` nested sub-invocations, one child per level. */
function deepChainInvocation(depth: number): unknown {
  return {
    function: fakeFunction,
    subInvocations: () => (depth <= 0 ? [] : [deepChainInvocation(depth - 1)]),
  };
}

/** One root invocation with `count` direct (leaf) children. */
function wideInvocation(count: number): unknown {
  return {
    function: fakeFunction,
    subInvocations: () =>
      Array.from({ length: count }, () => ({
        function: fakeFunction,
        subInvocations: () => [],
      })),
  };
}

function txWithRootInvocation(rootInvocation: unknown): Transaction {
  return {
    operations: [
      {
        type: "invokeHostFunction",
        auth: [
          {
            rootInvocation: () => rootInvocation,
            credentials: fakeCredentials,
          },
        ],
      },
    ],
  } as unknown as Transaction;
}

describe("parseSorobanAuthTree — depth/node safety cap", () => {
  it("does not truncate a normal shallow, narrow tree", () => {
    const trace = parseSorobanAuthTree(txWithRootInvocation(deepChainInvocation(3)));
    expect(trace.truncated).toBe(false);
    expect(trace.maxDepth).toBe(3);
    expect(trace.totalInvocations).toBe(4); // root + 3 nested
  });

  it("truncates a pathologically deep chain instead of recursing without bound", () => {
    const trace = parseSorobanAuthTree(txWithRootInvocation(deepChainInvocation(500)));
    expect(trace.truncated).toBe(true);
    // Depth is capped, not merely "large" — proves the recursion actually
    // stopped rather than just reporting a big number after the fact.
    expect(trace.maxDepth).toBeLessThanOrEqual(64);
  });

  it("truncates a pathologically wide tree (node-count cap) even though it's shallow", () => {
    const trace = parseSorobanAuthTree(txWithRootInvocation(wideInvocation(20_000)));
    expect(trace.truncated).toBe(true);
    expect(trace.totalInvocations).toBeLessThanOrEqual(5_000);
  });
});
