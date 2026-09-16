/**
 * Runs a demo scenario: build the candidate transaction, hand it straight
 * to the connected wallet's `signAndSendTransaction`, done. No on-page
 * pre-sign analysis, no site-rendered verdict. Whatever wallet is
 * connected is the only thing that ever sees this transaction before it's
 * broadcast — when that's Baret, the entire security moment happens
 * inside its own popup, not here.
 */

import { useCallback, useState } from "react";
import { toast } from "@stellar-thorn/ui";
import { useWallet } from "../wallet/context";
import { buildScenario, type ScenarioId, type ScenarioParams } from "./transactions";

export function useScenarioAction() {
  const { connected, openWalletModal, walletAddress, adapter } = useWallet();
  const [pending, setPending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const reset = useCallback(() => setTxHash(null), []);

  const run = useCallback(
    async (scenarioId: ScenarioId, params?: ScenarioParams) => {
      if (!connected || !walletAddress) {
        openWalletModal();
        return;
      }
      setPending(true);
      try {
        const { transactionXdr } = await buildScenario(scenarioId, walletAddress, params);
        const { signature } = await adapter.signAndSendTransaction(transactionXdr);
        setTxHash(signature);
      } catch (err) {
        toast.error("Transaction didn't go through", {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setPending(false);
      }
    },
    [connected, walletAddress, adapter, openWalletModal],
  );

  return { run, pending, txHash, success: txHash !== null, reset };
}
