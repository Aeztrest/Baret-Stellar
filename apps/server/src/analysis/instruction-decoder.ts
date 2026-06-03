import {
  Address,
  Asset,
  Operation,
  Transaction,
  xdr,
} from "@stellar/stellar-sdk";
import type {
  DecodedOperation,
  OperationAction,
  TransactionSummary,
} from "../domain/instruction-summary.js";

/**
 * Known Soroban Asset-Contract (SAC) addresses. Maps each address to the
 * classic asset it wraps so transfer/approve calls render as
 * "USDC transfer" rather than the raw contract id.
 */
const KNOWN_SAC: Record<string, { code: string; network: "pubnet" | "testnet" }> = {
  CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75: {
    code: "USDC",
    network: "pubnet",
  },
  CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA: {
    code: "USDC",
    network: "testnet",
  },
};

const SOROBAN_TOKEN_FUNCTIONS = new Set([
  "transfer",
  "approve",
  "burn",
  "mint",
  "burn_from",
  "transfer_from",
]);

export function decodeTransactionOperations(
  tx: Transaction,
): TransactionSummary {
  const operations: DecodedOperation[] = [];
  const contractSet = new Set<string>();
  const assetSet = new Set<string>();

  for (let i = 0; i < tx.operations.length; i++) {
    const op = tx.operations[i]!;
    const decoded = decodeOperation(op, i, contractSet, assetSet);
    operations.push(decoded);
  }

  const primaryAction = determinePrimaryAction(operations);
  const humanReadable = buildHumanReadable(operations, primaryAction);

  return {
    operations,
    humanReadable,
    primaryAction,
    involvedContracts: [...contractSet],
    involvedAssets: [...assetSet],
  };
}

function decodeOperation(
  op: Operation,
  index: number,
  contractSet: Set<string>,
  assetSet: Set<string>,
): DecodedOperation {
  const source = op.source ?? null;
  switch (op.type) {
    case "payment": {
      const o = op as Operation.Payment;
      const assetStr = assetIdentifier(o.asset);
      assetSet.add(assetStr);
      return {
        index,
        type: op.type,
        source,
        action: "payment",
        description: `Payment ${o.amount} ${assetCodeOrNative(o.asset)} → ${shortAddr(o.destination)}`,
        details: { destination: o.destination, asset: assetStr, amount: o.amount },
      };
    }
    case "pathPaymentStrictReceive":
    case "pathPaymentStrictSend": {
      const o = op as
        | Operation.PathPaymentStrictReceive
        | Operation.PathPaymentStrictSend;
      assetSet.add(assetIdentifier(o.sendAsset));
      assetSet.add(assetIdentifier(o.destAsset));
      return {
        index,
        type: op.type,
        source,
        action: "path_payment",
        description: `Path payment ${assetCodeOrNative(o.sendAsset)} → ${assetCodeOrNative(o.destAsset)}`,
      };
    }
    case "changeTrust": {
      const o = op as Operation.ChangeTrust;
      const assetStr =
        "asset" in o && o.asset
          ? assetIdentifier(o.asset as Asset)
          : "unknown";
      assetSet.add(assetStr);
      const isRemoval = o.limit === "0";
      return {
        index,
        type: op.type,
        source,
        action: "change_trust",
        description: isRemoval
          ? `Remove trustline ${assetStr}`
          : `Change trustline ${assetStr} → ${o.limit ?? "max"}`,
        details: { asset: assetStr, limit: o.limit ?? "max" },
      };
    }
    case "manageSellOffer":
    case "manageBuyOffer":
    case "createPassiveSellOffer": {
      const o = op as
        | Operation.ManageSellOffer
        | Operation.ManageBuyOffer
        | Operation.CreatePassiveSellOffer;
      assetSet.add(assetIdentifier(o.selling));
      assetSet.add(assetIdentifier(o.buying));
      return {
        index,
        type: op.type,
        source,
        action: "manage_offer",
        description: `Order ${assetCodeOrNative(o.selling)} → ${assetCodeOrNative(o.buying)}`,
      };
    }
    case "createAccount": {
      const o = op as Operation.CreateAccount;
      return {
        index,
        type: op.type,
        source,
        action: "create_account",
        description: `Create account ${shortAddr(o.destination)} (${o.startingBalance} XLM)`,
      };
    }
    case "accountMerge": {
      const o = op as Operation.AccountMerge;
      return {
        index,
        type: op.type,
        source,
        action: "account_merge",
        description: `Merge account → ${shortAddr(o.destination)}`,
      };
    }
    case "setOptions": {
      const o = op as Operation.SetOptions;
      const parts: string[] = [];
      if (o.masterWeight != null) parts.push(`master=${o.masterWeight}`);
      if (o.lowThreshold != null) parts.push(`low=${o.lowThreshold}`);
      if (o.medThreshold != null) parts.push(`med=${o.medThreshold}`);
      if (o.highThreshold != null) parts.push(`high=${o.highThreshold}`);
      if (o.signer) parts.push("signer±");
      return {
        index,
        type: op.type,
        source,
        action: "set_options",
        description: `setOptions(${parts.join(", ") || "no-op"})`,
        details: { changes: parts },
      };
    }
    case "manageData": {
      const o = op as Operation.ManageData;
      return {
        index,
        type: op.type,
        source,
        action: "manage_data",
        description: `manageData[${o.name}]`,
      };
    }
    case "bumpSequence": {
      return {
        index,
        type: op.type,
        source,
        action: "bump_sequence",
        description: "bumpSequence",
      };
    }
    case "extendFootprintTtl": {
      return {
        index,
        type: op.type,
        source,
        action: "extend_footprint_ttl",
        description: "extendFootprintTtl",
      };
    }
    case "restoreFootprint": {
      return {
        index,
        type: op.type,
        source,
        action: "restore_footprint",
        description: "restoreFootprint",
      };
    }
    case "invokeHostFunction": {
      return decodeInvokeHostFunction(
        op as Operation.InvokeHostFunction,
        index,
        source,
        contractSet,
        assetSet,
      );
    }
    case "claimClaimableBalance": {
      return {
        index,
        type: op.type,
        source,
        action: "claim_claimable_balance",
        description: "claimClaimableBalance",
      };
    }
    case "createClaimableBalance": {
      return {
        index,
        type: op.type,
        source,
        action: "create_claimable_balance",
        description: "createClaimableBalance",
      };
    }
    case "clawback": {
      const o = op as Operation.Clawback;
      assetSet.add(assetIdentifier(o.asset));
      return {
        index,
        type: op.type,
        source,
        action: "clawback",
        description: `Clawback ${o.amount} ${assetCodeOrNative(o.asset)}`,
      };
    }
    default:
      return {
        index,
        type: op.type,
        source,
        action: "unknown",
        description: `${op.type} operation`,
      };
  }
}

function decodeInvokeHostFunction(
  op: Operation.InvokeHostFunction,
  index: number,
  source: string | null,
  contractSet: Set<string>,
  assetSet: Set<string>,
): DecodedOperation {
  const hostFn = op.func;
  const fnType = hostFn.switch().value;

  if (fnType === xdr.HostFunctionType.hostFunctionTypeInvokeContract().value) {
    const args = hostFn.invokeContract();
    const contractAddress = (() => {
      try {
        return Address.fromScAddress(args.contractAddress()).toString();
      } catch {
        return "";
      }
    })();
    const functionName = args.functionName().toString();
    if (contractAddress) {
      contractSet.add(contractAddress);
      assetSet.add(`C:${contractAddress}`);
    }

    const sac = KNOWN_SAC[contractAddress];
    const tokenLabel = sac ? sac.code : `contract ${shortAddr(contractAddress)}`;

    if (SOROBAN_TOKEN_FUNCTIONS.has(functionName)) {
      return {
        index,
        type: op.type,
        source,
        action: tokenFunctionToAction(functionName),
        description: `${functionName}(${tokenLabel})`,
        details: { contractAddress, functionName },
      };
    }

    return {
      index,
      type: op.type,
      source,
      action: "soroban_invoke",
      description: `Invoke ${tokenLabel}.${functionName}()`,
      details: { contractAddress, functionName },
    };
  }

  if (fnType === xdr.HostFunctionType.hostFunctionTypeCreateContract().value) {
    return {
      index,
      type: op.type,
      source,
      action: "soroban_deploy_contract",
      description: "Deploy new Soroban contract",
    };
  }

  if (
    fnType === xdr.HostFunctionType.hostFunctionTypeUploadContractWasm().value
  ) {
    return {
      index,
      type: op.type,
      source,
      action: "soroban_upload_wasm",
      description: "Upload Soroban contract WASM",
    };
  }

  return {
    index,
    type: op.type,
    source,
    action: "soroban_invoke",
    description: "Soroban host function",
  };
}

function tokenFunctionToAction(fn: string): OperationAction {
  switch (fn) {
    case "transfer":
    case "transfer_from":
      return "soroban_transfer";
    case "approve":
      return "soroban_approve";
    case "burn":
    case "burn_from":
      return "soroban_burn";
    case "mint":
      return "soroban_mint";
    default:
      return "soroban_invoke";
  }
}

function determinePrimaryAction(decoded: DecodedOperation[]): OperationAction {
  const priority: OperationAction[] = [
    "account_merge",
    "set_options",
    "change_trust",
    "soroban_approve",
    "soroban_transfer",
    "payment",
    "path_payment",
    "manage_offer",
    "soroban_burn",
    "soroban_mint",
    "soroban_invoke",
    "soroban_deploy_contract",
    "soroban_upload_wasm",
    "create_account",
    "claim_claimable_balance",
    "create_claimable_balance",
    "clawback",
    "manage_data",
    "bump_sequence",
    "extend_footprint_ttl",
    "restore_footprint",
    "unknown",
  ];
  for (const action of priority) {
    if (decoded.some((d) => d.action === action)) return action;
  }
  return "unknown";
}

function buildHumanReadable(
  decoded: DecodedOperation[],
  primary: OperationAction,
): string {
  const meaningful = decoded.filter(
    (d) =>
      d.action !== "extend_footprint_ttl" &&
      d.action !== "restore_footprint" &&
      d.action !== "bump_sequence" &&
      d.action !== "unknown",
  );

  if (meaningful.length === 0) {
    return decoded.length > 0
      ? decoded.map((d) => d.description).join("; ")
      : "Empty transaction";
  }

  if (primary === "account_merge")
    return (
      meaningful.find((d) => d.action === "account_merge")?.description ??
      "Account merge"
    );
  if (primary === "soroban_transfer" || primary === "payment") {
    const first = meaningful.find(
      (d) => d.action === "soroban_transfer" || d.action === "payment",
    );
    return first?.description ?? "Transfer";
  }
  if (primary === "change_trust")
    return (
      meaningful.find((d) => d.action === "change_trust")?.description ??
      "Trustline change"
    );
  if (primary === "soroban_approve")
    return (
      meaningful.find((d) => d.action === "soroban_approve")?.description ??
      "Token approval"
    );

  return meaningful.map((d) => d.description).join("; ");
}

function assetIdentifier(asset: Asset): string {
  if (asset.isNative()) return "native";
  return `${asset.getCode()}:${asset.getIssuer()}`;
}

function assetCodeOrNative(asset: Asset): string {
  return asset.isNative() ? "XLM" : asset.getCode();
}

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
