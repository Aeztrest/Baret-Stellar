import {
  Address,
  Operation,
  Transaction,
  xdr,
} from "@stellar/stellar-sdk";
import type { CpiNode, CpiTrace } from "../domain/cpi-trace.js";

/**
 * Builds the Soroban auth tree — a directed graph of contract → contract
 * calls that the transaction is requesting authorization for. The root
 * invocations correspond to the entries on the tx's `InvokeHostFunction`
 * op; descendants come from `subInvocations()` on each entry.
 *
 * This is the Soroban authorization tree — downstream detectors score it
 * on depth, breadth, and identity exposure.
 */
export function parseSorobanAuthTree(tx: Transaction): CpiTrace {
  const allContractAddresses = new Set<string>();
  const roots: CpiNode[] = [];

  for (const op of tx.operations) {
    if (op.type !== "invokeHostFunction") continue;
    const invokeOp = op as Operation.InvokeHostFunction;
    for (const auth of invokeOp.auth ?? []) {
      const rootNode = invocationToNode(
        auth.rootInvocation(),
        authorizerFromCredentials(auth.credentials()),
        0,
        allContractAddresses,
      );
      if (rootNode) roots.push(rootNode);
    }
  }

  let maxDepth = 0;
  let totalInvocations = 0;
  const visit = (node: CpiNode, depth: number) => {
    totalInvocations++;
    if (depth > maxDepth) maxDepth = depth;
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);

  return {
    roots,
    allContractAddresses: [...allContractAddresses],
    maxDepth,
    totalInvocations,
  };
}

function invocationToNode(
  invocation: xdr.SorobanAuthorizedInvocation,
  authorizer: string | null,
  depth: number,
  allAddresses: Set<string>,
): CpiNode | null {
  const fn = invocation.function();
  if (
    fn.switch().value !==
    xdr.SorobanAuthorizedFunctionType.sorobanAuthorizedFunctionTypeContractFn().value
  ) {
    // CreateContract / WASM upload entries — represented as zero-arg roots
    // so detectors still see them.
    return {
      contractAddress: "",
      functionName: fn.switch().name,
      depth,
      authorizer,
      argsXdr: [],
      children: invocation
        .subInvocations()
        .map((sub) => invocationToNode(sub, authorizer, depth + 1, allAddresses))
        .filter((n): n is CpiNode => n !== null),
    };
  }

  const args = fn.contractFn();
  const contractAddress = scAddressToString(args.contractAddress()) ?? "";
  if (contractAddress) allAddresses.add(contractAddress);

  const functionName = args.functionName().toString();
  const argsXdr = args.args().map((arg) => arg.toXDR("base64"));

  return {
    contractAddress,
    functionName,
    depth,
    authorizer,
    argsXdr,
    children: invocation
      .subInvocations()
      .map((sub) => invocationToNode(sub, authorizer, depth + 1, allAddresses))
      .filter((n): n is CpiNode => n !== null),
  };
}

function authorizerFromCredentials(
  credentials: xdr.SorobanCredentials,
): string | null {
  if (
    credentials.switch().value !==
    xdr.SorobanCredentialsType.sorobanCredentialsAddress().value
  ) {
    return null; // `auth_as_curr_contract` — no separate authorizer.
  }
  return scAddressToString(credentials.address().address());
}

function scAddressToString(addr: xdr.ScAddress): string | null {
  try {
    return Address.fromScAddress(addr).toString();
  } catch {
    return null;
  }
}
