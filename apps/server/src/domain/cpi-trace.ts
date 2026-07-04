/**
 * Soroban sub-invocation tree. Each node = one contract call that needs an
 * auth entry. The root nodes are the contract calls in the tx's
 * `InvokeHostFunction` op; children are calls that those contracts make
 * via `auth_as_curr_contract` (Soroban's CPI analogue).
 *
 * Field names are kept generic (`CpiNode` / `CpiTrace`) so downstream
 * detectors can reason about depth and breadth without knowing it's Soroban.
 */
export type CpiNode = {
  /** Soroban contract address (C…) being invoked. */
  contractAddress: string;
  /** Function name on the contract. */
  functionName: string;
  /** Depth in the auth tree (0 = root). */
  depth: number;
  /** Authorizer for this node. `null` when the entry is `auth_as_curr_contract`. */
  authorizer: string | null;
  /** Arg XDRs (base64) preserved for detector inspection. */
  argsXdr: string[];
  children: CpiNode[];
};

export type CpiTrace = {
  roots: CpiNode[];
  /** All distinct contract addresses anywhere in the tree. */
  allContractAddresses: string[];
  /** Deepest sub-invocation level encountered (capped — see `truncated`). */
  maxDepth: number;
  /** Total number of nodes (root + descendants; capped — see `truncated`). */
  totalInvocations: number;
  /**
   * `true` when the auth tree hit the depth or node-count safety cap during
   * parsing and further sub-invocations were not expanded. A `true` value
   * already implies the tree is enormous, so downstream depth/breadth
   * detectors should treat it as maximally suspicious regardless of the
   * (capped) `maxDepth`/`totalInvocations` numbers.
   */
  truncated: boolean;
};
