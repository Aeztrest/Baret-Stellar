/**
 * Showcase demo transaction builders (Stellar build).
 *
 * Each scenario produces a different Stellar tx shape so Baret's policy
 * gate has something distinct to evaluate. Safe scenarios use plain XLM
 * payments or USDC Soroban transfers; danger scenarios reach for the
 * common Stellar attack primitives. unlimited trustlines, account merge to
 * an attacker address, Soroban allowance grants to unknown contracts.
 *
 * The returned XDR is unsigned; the demo wallet signs + submits (or, when
 * `Sign with BARET` is chosen, the extension popup signs after running
 * the same analyze pipeline a second time as authoritative gatekeeper).
 */

import {
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Horizon,
  Memo,
  nativeToScVal,
  Networks,
  Operation,
  TransactionBuilder,
  xdr,
  type Networks as NetworksType,
} from "@stellar/stellar-sdk";

export type ScenarioId =
  | "novaswap-safe"
  | "novaswap-danger"
  | "pixeldrop-safe"
  | "pixeldrop-danger"
  | "orbityield-safe"
  | "orbityield-warn"
  | "claimhub-safe"
  | "claimhub-danger"
  | "launchpad-safe"
  | "launchpad-danger";

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE: NetworksType = Networks.TESTNET;

// Circle USDC Soroban Asset Contract on testnet.
const USDC_SAC_TESTNET =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

// Synthetic contract addresses for danger scenarios. recognizable as
// untrusted because they're not on any known-safe allowlist.
const FAKE_DEX_CONTRACT =
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const FAKE_DRAINER_CONTRACT =
  "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const FAKE_STAKING_CONTRACT =
  "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
const FAKE_CLAIM_CONTRACT =
  "CDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD";
const FAKE_LAUNCH_CONTRACT =
  "CEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE";

// Synthetic attacker G… address for AccountMerge danger scenarios.
const ATTACKER_ACCOUNT =
  "GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

// Stellar uses int64-max ("9223372036854775807") as the trustline "unlimited"
// sentinel and ~i128-max for Soroban allowances.
const STELLAR_UNLIMITED_TRUSTLINE = "9223372036854775807";
const SOROBAN_UNLIMITED_AMOUNT = (2n ** 127n - 1n).toString();

export interface BuiltScenario {
  /** Base64 unsigned TransactionEnvelope XDR. */
  transactionXdr: string;
  /** Short human description rendered in the RiskPreview hero. */
  label: string;
}

/**
 * Build the candidate transaction for a given scenario. The user wallet's
 * `G…` address is required because Stellar transactions are anchored to the
 * source account's current sequence number, which we fetch from Horizon.
 */
export async function buildScenario(
  scenario: ScenarioId,
  userWallet: string,
): Promise<BuiltScenario> {
  const horizon = new Horizon.Server(HORIZON_TESTNET);
  const source = await horizon.loadAccount(userWallet).catch(() => {
    throw new Error(
      `Couldn't load ${userWallet} on testnet. Fund it via friendbot and try again.`,
    );
  });

  const builder = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  switch (scenario) {
    case "novaswap-safe":
      return finish(
        builder
          .addOperation(
            Operation.payment({
              destination: userWallet,
              asset: Asset.native(),
              amount: "0.0001000",
            }),
          )
          .addMemo(Memo.text("novaswap:safe-quote")),
        "NovaSwap: 0.0001 XLM self-payment quote",
      );

    case "novaswap-danger":
      return finish(
        builder
          .addOperation(
            sorobanInvoke(FAKE_DEX_CONTRACT, "approve", [
              addressArg(userWallet),
              addressArg(FAKE_DRAINER_CONTRACT),
              i128Arg(SOROBAN_UNLIMITED_AMOUNT),
              u32Arg(99_999_999),
            ]),
          )
          .addMemo(Memo.text("novaswap:danger-approve")),
        "NovaSwap: unlimited Soroban approve to a stranger contract",
      );

    case "pixeldrop-safe":
      return finish(
        builder
          .addOperation(
            sorobanInvoke(USDC_SAC_TESTNET, "transfer", [
              addressArg(userWallet),
              addressArg(userWallet),
              i128Arg("10000"),
            ]),
          )
          .addMemo(Memo.text("pixeldrop:safe-mint")),
        "PixelDrop: 0.001 USDC SAC transfer (mint fee)",
      );

    case "pixeldrop-danger":
      return finish(
        builder
          .addOperation(
            Operation.changeTrust({
              asset: new Asset("EVIL", ATTACKER_ACCOUNT),
              limit: STELLAR_UNLIMITED_TRUSTLINE,
            }),
          )
          .addMemo(Memo.text("pixeldrop:trust-evil-issuer")),
        "PixelDrop: unlimited trustline to an untrusted issuer",
      );

    case "orbityield-safe":
      return finish(
        builder
          .addOperation(
            sorobanInvoke(FAKE_STAKING_CONTRACT, "deposit", [
              addressArg(userWallet),
              i128Arg("10000000"),
            ]),
          )
          .addMemo(Memo.text("orbityield:deposit-1xlm")),
        "OrbitYield: deposit 1 XLM into staking",
      );

    case "orbityield-warn":
      return finish(
        builder
          .addOperation(
            sorobanInvoke(FAKE_STAKING_CONTRACT, "deposit", [
              addressArg(userWallet),
              i128Arg("1000000000"),
            ]),
          )
          .addMemo(Memo.text("orbityield:deposit-100xlm")),
        "OrbitYield: deposit 100 XLM (large position warns on resource fee)",
      );

    case "claimhub-safe":
      return finish(
        builder
          .addOperation(
            sorobanInvoke(FAKE_CLAIM_CONTRACT, "claim", [
              addressArg(userWallet),
              i128Arg("1000"),
            ]),
          )
          .addMemo(Memo.text("claimhub:airdrop-claim")),
        "ClaimHub: airdrop claim call on the demo claim contract",
      );

    case "claimhub-danger":
      return finish(
        builder
          .addOperation(
            Operation.accountMerge({
              destination: ATTACKER_ACCOUNT,
            }),
          )
          .addMemo(Memo.text("claimhub:account-drain")),
        "ClaimHub: AccountMerge. drains entire XLM balance to attacker",
      );

    case "launchpad-safe":
      return finish(
        builder
          .addOperation(
            sorobanInvoke(FAKE_LAUNCH_CONTRACT, "buy", [
              addressArg(userWallet),
              i128Arg("5000000"),
            ]),
          )
          .addMemo(Memo.text("launchpad:presale-buy")),
        "LaunchPad: 0.5 XLM presale allocation",
      );

    case "launchpad-danger":
      return finish(
        builder
          .addOperation(
            sorobanInvoke(USDC_SAC_TESTNET, "approve", [
              addressArg(userWallet),
              addressArg(FAKE_LAUNCH_CONTRACT),
              i128Arg(SOROBAN_UNLIMITED_AMOUNT),
              u32Arg(99_999_999),
            ]),
          )
          .addMemo(Memo.text("launchpad:approve-drainer")),
        "LaunchPad: unlimited USDC approve to a stranger launch contract",
      );
  }
}

/**
 * Submit an already-signed transaction directly to Horizon. no Baret
 * analyze call, no wallet-side policy gate. This is the actual "without
 * protection" path: it never touches the Baret pipeline at all.
 */
export async function submitSignedTransaction(signedTxXdr: string): Promise<string> {
  const horizon = new Horizon.Server(HORIZON_TESTNET);
  const tx = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
  const result = await horizon.submitTransaction(tx);
  return result.hash;
}

function finish(builder: TransactionBuilder, label: string): BuiltScenario {
  const tx = builder.setTimeout(60).build();
  return { transactionXdr: tx.toXDR(), label };
}

function sorobanInvoke(
  contractAddress: string,
  functionName: string,
  args: xdr.ScVal[],
): ReturnType<typeof Operation.invokeHostFunction> {
  const contract = new Contract(contractAddress);
  return contract.call(functionName, ...args);
}

function addressArg(address: string): xdr.ScVal {
  return nativeToScVal(Address.fromString(address), { type: "address" });
}

function i128Arg(value: string | bigint): xdr.ScVal {
  return nativeToScVal(typeof value === "string" ? BigInt(value) : value, {
    type: "i128",
  });
}

function u32Arg(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: "u32" });
}
