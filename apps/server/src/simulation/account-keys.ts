import {
  Address,
  Asset,
  Operation,
  Transaction,
  StrKey,
  xdr,
} from "@stellar/stellar-sdk";

export type TxAccountSet = {
  /** Tx-level source account (`G…`). */
  txSource: string;
  /** Tx fee (stroops, decimal string). */
  feeStroops: string;
  /** Distinct classic G… accounts referenced anywhere in the tx. */
  classicAccountIds: string[];
  /** Distinct Soroban contract addresses (C…) referenced anywhere in the tx. */
  contractAddresses: string[];
  /**
   * Distinct asset identifiers touched by the tx. Classic assets render as
   * `CODE:ISSUER` (and `"native"` for XLM); Soroban-only tokens render as
   * their contract address (`C…`).
   */
  assets: string[];
};

/**
 * Walks the tx's operations and harvests every distinct account / contract /
 * asset identifier. The result drives detector + delta extraction without
 * forcing those modules to re-parse the SDK operation tree.
 */
export function collectTxAccounts(tx: Transaction): TxAccountSet {
  const classic = new Set<string>([tx.source]);
  const contracts = new Set<string>();
  const assets = new Set<string>();

  for (const op of tx.operations) {
    if (op.source) addClassicOrContract(op.source, classic, contracts);
    walkOperation(op, classic, contracts, assets);
  }

  return {
    txSource: tx.source,
    feeStroops: tx.fee.toString(),
    classicAccountIds: [...classic],
    contractAddresses: [...contracts],
    assets: [...assets],
  };
}

function walkOperation(
  op: Operation,
  classic: Set<string>,
  contracts: Set<string>,
  assets: Set<string>,
): void {
  switch (op.type) {
    case "payment": {
      const o = op as Operation.Payment;
      addClassicOrContract(o.destination, classic, contracts);
      addAssetIdentifier(o.asset, assets);
      break;
    }
    case "clawback": {
      const o = op as Operation.Clawback;
      addClassicOrContract(o.from, classic, contracts);
      addAssetIdentifier(o.asset, assets);
      break;
    }
    case "createClaimableBalance": {
      const o = op as Operation.CreateClaimableBalance;
      addAssetIdentifier(o.asset, assets);
      for (const claimant of o.claimants ?? []) {
        addClassicOrContract(claimant.destination, classic, contracts);
      }
      break;
    }
    case "pathPaymentStrictReceive":
    case "pathPaymentStrictSend": {
      const o = op as
        | Operation.PathPaymentStrictReceive
        | Operation.PathPaymentStrictSend;
      addClassicOrContract(o.destination, classic, contracts);
      addAssetIdentifier(o.sendAsset, assets);
      addAssetIdentifier(o.destAsset, assets);
      for (const hop of o.path ?? []) addAssetIdentifier(hop, assets);
      break;
    }
    case "changeTrust": {
      const o = op as Operation.ChangeTrust;
      if ("asset" in o && o.asset) addAssetIdentifier(o.asset as Asset, assets);
      break;
    }
    case "createAccount": {
      const o = op as Operation.CreateAccount;
      addClassicOrContract(o.destination, classic, contracts);
      break;
    }
    case "accountMerge": {
      const o = op as Operation.AccountMerge;
      addClassicOrContract(o.destination, classic, contracts);
      break;
    }
    case "setOptions": {
      const o = op as Operation.SetOptions;
      if (o.inflationDest) addClassicOrContract(o.inflationDest, classic, contracts);
      const signer = o.signer as { ed25519PublicKey?: string } | undefined;
      if (signer?.ed25519PublicKey) {
        addClassicOrContract(signer.ed25519PublicKey, classic, contracts);
      }
      break;
    }
    case "manageSellOffer":
    case "manageBuyOffer":
    case "createPassiveSellOffer": {
      const o = op as
        | Operation.ManageSellOffer
        | Operation.ManageBuyOffer
        | Operation.CreatePassiveSellOffer;
      addAssetIdentifier(o.selling, assets);
      addAssetIdentifier(o.buying, assets);
      break;
    }
    case "invokeHostFunction": {
      collectFromInvokeHostFunction(
        op as Operation.InvokeHostFunction,
        classic,
        contracts,
        assets,
      );
      break;
    }
    // Operations with no extra addresses worth surfacing for risk purposes.
    case "manageData":
    case "bumpSequence":
    case "extendFootprintTtl":
    case "restoreFootprint":
    default:
      break;
  }
}

function collectFromInvokeHostFunction(
  op: Operation.InvokeHostFunction,
  classic: Set<string>,
  contracts: Set<string>,
  assets: Set<string>,
): void {
  // Auth entries reference the contract and authorizer addresses we care about.
  for (const auth of op.auth ?? []) {
    const credentials = auth.credentials();
    if (credentials.switch().value === xdr.SorobanCredentialsType.sorobanCredentialsAddress().value) {
      const addrCred = credentials.address();
      const addr = scAddressToString(addrCred.address());
      if (addr) addClassicOrContract(addr, classic, contracts);
    }

    const rootInvocation = auth.rootInvocation();
    walkInvocation(rootInvocation, classic, contracts, assets);
  }

  // The host function itself: only `invokeContract` carries an embedded contract address.
  const hostFn = op.func;
  if (
    hostFn.switch().value ===
    xdr.HostFunctionType.hostFunctionTypeInvokeContract().value
  ) {
    const invokeArgs = hostFn.invokeContract();
    const addr = scAddressToString(invokeArgs.contractAddress());
    if (addr) addClassicOrContract(addr, classic, contracts);
  }
}

function walkInvocation(
  invocation: xdr.SorobanAuthorizedInvocation,
  classic: Set<string>,
  contracts: Set<string>,
  assets: Set<string>,
): void {
  const fn = invocation.function();
  if (
    fn.switch().value ===
    xdr.SorobanAuthorizedFunctionType.sorobanAuthorizedFunctionTypeContractFn().value
  ) {
    const args = fn.contractFn();
    const addr = scAddressToString(args.contractAddress());
    if (addr) addClassicOrContract(addr, classic, contracts);
  }
  for (const child of invocation.subInvocations() ?? []) {
    walkInvocation(child, classic, contracts, assets);
  }
}

function addClassicOrContract(
  raw: string,
  classic: Set<string>,
  contracts: Set<string>,
): void {
  if (!raw) return;
  if (StrKey.isValidContract(raw)) {
    contracts.add(raw);
    return;
  }
  if (StrKey.isValidEd25519PublicKey(raw)) {
    classic.add(raw);
  }
}

function addAssetIdentifier(asset: Asset, assets: Set<string>): void {
  if (asset.isNative()) {
    assets.add("native");
    return;
  }
  assets.add(`${asset.getCode()}:${asset.getIssuer()}`);
}

function scAddressToString(addr: xdr.ScAddress): string | null {
  try {
    return Address.fromScAddress(addr).toString();
  } catch {
    return null;
  }
}
