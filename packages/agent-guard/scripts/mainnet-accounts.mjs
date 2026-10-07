// One-off mainnet setup for the Instawards proof: opens the agent and
// merchant accounts from the owner (3 XLM each) and adds the Circle USDC
// trustline to the owner and the merchant, in one transaction.
//
// Run it yourself from the repo root; keys are read from the stellar CLI
// key store at run time and never written anywhere:
//   OWNER_S=$(stellar keys show baret-owner) MERCHANT_S=$(stellar keys show baret-merchant) \
//   AGENT_P=$(stellar keys address baret-agent) node packages/agent-guard/scripts/mainnet-accounts.mjs

import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const { OWNER_S, MERCHANT_S, AGENT_P } = process.env;
if (!OWNER_S || !MERCHANT_S || !AGENT_P) {
  console.error("OWNER_S, MERCHANT_S and AGENT_P must be set (see the header of this file)");
  process.exit(2);
}

const horizon = new Horizon.Server("https://horizon.stellar.org");
const owner = Keypair.fromSecret(OWNER_S);
const merchant = Keypair.fromSecret(MERCHANT_S);
// Circle USDC; issuer home domain is circle.com.
const usdc = new Asset("USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");

const tx = new TransactionBuilder(await horizon.loadAccount(owner.publicKey()), {
  fee: "1000",
  networkPassphrase: Networks.PUBLIC,
})
  .addOperation(Operation.createAccount({ destination: AGENT_P, startingBalance: "3" }))
  .addOperation(Operation.createAccount({ destination: merchant.publicKey(), startingBalance: "3" }))
  .addOperation(Operation.changeTrust({ asset: usdc }))
  .addOperation(Operation.changeTrust({ asset: usdc, source: merchant.publicKey() }))
  .setTimeout(120)
  .build();
tx.sign(owner);
tx.sign(merchant);

try {
  const res = await horizon.submitTransaction(tx);
  console.log(`OK https://stellar.expert/explorer/public/tx/${res.hash}`);
} catch (e) {
  console.error("FAILED", JSON.stringify(e.response?.data?.extras?.result_codes ?? e.message));
  process.exit(1);
}
