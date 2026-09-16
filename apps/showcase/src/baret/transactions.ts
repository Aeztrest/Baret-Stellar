/**
 * Showcase demo transaction builders (Stellar build).
 *
 * Each scenario produces a different Stellar tx shape so Baret's policy
 * gate has something distinct to evaluate. Safe scenarios are small
 * self-payments (harmless, never need a pre-funded token balance, never
 * touch an address the user doesn't own); danger scenarios reach for real
 * Stellar attack primitives: unlimited trustlines, AccountMerge to an
 * attacker address, an unlimited Soroban allowance on the real USDC asset
 * contract, and a real payment straight to an unrecognized address. Every
 * scenario below builds an operation that actually exists on testnet —
 * none of them target a made-up, undeployed contract, because those can
 * never pass Soroban simulation and would just fail silently on submit.
 *
 * The returned XDR is unsigned; whichever wallet is connected signs and
 * submits it. When that's Baret, its own popup runs the real analysis
 * pipeline before it signs — nothing on the site pre-checks it.
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
  rpc,
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
const SOROBAN_RPC_TESTNET = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE: NetworksType = Networks.TESTNET;

// Circle USDC Soroban Asset Contract on testnet — a real, deployed contract,
// so `approve` against it actually simulates and submits.
const USDC_SAC_TESTNET =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

// Synthetic attacker/unknown addresses for danger scenarios. Real,
// validly-encoded testnet keypairs whose secret keys were generated once
// and discarded — recognizable as untrusted because they're not on any
// known-safe allowlist, and nobody holds the private key, so anything
// sent to them is gone for good, same as a real drainer address. (Must be
// real StrKey addresses, not placeholder strings — the SDK rejects
// anything that isn't a validly checksummed address at build time.)
const FAKE_DRAINER_ADDRESS =
  "GDRDIEXE3C26HHX4IPISH4PHTP53TIOESRPFF7WQAYENHE3CYEELNM4E";
const FAKE_LAUNCH_ADDRESS =
  "GCJLJNITXN6KLTF2AIFT7VWOU2MAVG6D32YVIC7VAKR2F3METF2CQU2Y";
const ATTACKER_ACCOUNT =
  "GATEOM52PKBR4PQISO326PP2UIF4NRZGLRGJ2FVFVJP4NILABZYGW2B6";

// changeTrust's `limit` is a decimal string (up to 7 fractional digits), not
// raw stroops — this is int64-max stroops (9223372036854775807) expressed in
// that decimal form, i.e. the trustline "unlimited" sentinel.
const STELLAR_UNLIMITED_TRUSTLINE = "922337203685.4775807";
const SOROBAN_UNLIMITED_AMOUNT = (2n ** 127n - 1n).toString();
// A Soroban allowance's `live_until_ledger` can't be set further out than
// the network's max entry TTL (~3,110,400 ledgers, ~6 months at 5s/ledger)
// past the current ledger. It's an absolute ledger number, so it has to be
// computed from the current ledger at build time, not hardcoded.
const MAX_APPROVAL_TTL_LEDGERS = 3_100_000;

export interface BuiltScenario {
  /** Base64 unsigned TransactionEnvelope XDR. */
  transactionXdr: string;
  /** Short human description of the scenario. */
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
      // Soroban transactions can't carry a classic memo.
      return finish(
        builder.addOperation(
          sorobanInvoke(USDC_SAC_TESTNET, "approve", [
            addressArg(userWallet),
            addressArg(FAKE_DRAINER_ADDRESS),
            i128Arg(SOROBAN_UNLIMITED_AMOUNT),
            u32Arg(await approvalExpirationLedger()),
          ]),
        ),
        "NovaSwap: unlimited USDC approve to a stranger contract",
        { soroban: true },
      );

    case "pixeldrop-safe":
      return finish(
        builder
          .addOperation(
            Operation.payment({
              destination: userWallet,
              asset: Asset.native(),
              amount: "0.0001000",
            }),
          )
          .addMemo(Memo.text("pixeldrop:safe-mint")),
        "PixelDrop: 0.0001 XLM mint-fee self-payment",
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
            Operation.payment({
              destination: userWallet,
              asset: Asset.native(),
              amount: "0.0001000",
            }),
          )
          .addMemo(Memo.text("orbityield:safe-deposit")),
        "OrbitYield: 0.0001 XLM stake self-payment",
      );

    case "orbityield-warn":
      return finish(
        builder
          .addOperation(
            Operation.payment({
              destination: ATTACKER_ACCOUNT,
              asset: Asset.native(),
              amount: "5.0000000",
            }),
          )
          .addMemo(Memo.text("orbityield:unverified-pool")),
        "OrbitYield: 5 XLM sent to an unverified pool address",
      );

    case "claimhub-safe":
      return finish(
        builder
          .addOperation(
            Operation.payment({
              destination: userWallet,
              asset: Asset.native(),
              amount: "0.0001000",
            }),
          )
          .addMemo(Memo.text("claimhub:airdrop-claim")),
        "ClaimHub: 0.0001 XLM claim self-payment",
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
            Operation.payment({
              destination: userWallet,
              asset: Asset.native(),
              amount: "0.0001000",
            }),
          )
          .addMemo(Memo.text("launchpad:presale-buy")),
        "LaunchPad: 0.0001 XLM contribution self-payment",
      );

    case "launchpad-danger":
      // Soroban transactions can't carry a classic memo.
      return finish(
        builder.addOperation(
          sorobanInvoke(USDC_SAC_TESTNET, "approve", [
            addressArg(userWallet),
            addressArg(FAKE_LAUNCH_ADDRESS),
            i128Arg(SOROBAN_UNLIMITED_AMOUNT),
            u32Arg(await approvalExpirationLedger()),
          ]),
        ),
        "LaunchPad: unlimited USDC approve to a stranger launch contract",
        { soroban: true },
      );
  }
}

/**
 * Submit an already-signed transaction directly to Horizon. Used as the
 * fallback for wallets (Baret included) that only implement
 * `signTransaction`, not `signAndSendTransaction`.
 */
export async function submitSignedTransaction(signedTxXdr: string): Promise<string> {
  const horizon = new Horizon.Server(HORIZON_TESTNET);
  const tx = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
  const result = await horizon.submitTransaction(tx);
  return result.hash;
}

/**
 * Classic operations (payment, changeTrust, accountMerge) submit as-is.
 * A Soroban `invokeHostFunction` needs its resource footprint + fee
 * simulated and attached first, or the network rejects it outright.
 */
async function finish(
  builder: TransactionBuilder,
  label: string,
  opts: { soroban?: boolean } = {},
): Promise<BuiltScenario> {
  const tx = builder.setTimeout(60).build();
  if (!opts.soroban) {
    return { transactionXdr: tx.toXDR(), label };
  }
  const server = new rpc.Server(SOROBAN_RPC_TESTNET);
  const prepared = await server.prepareTransaction(tx);
  return { transactionXdr: prepared.toXDR(), label };
}

async function approvalExpirationLedger(): Promise<number> {
  const server = new rpc.Server(SOROBAN_RPC_TESTNET);
  const { sequence } = await server.getLatestLedger();
  return sequence + MAX_APPROVAL_TTL_LEDGERS;
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
