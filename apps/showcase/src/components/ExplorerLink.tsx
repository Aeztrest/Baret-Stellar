import { ExternalLink } from "lucide-react";

/** Link to the real, confirmed transaction on stellar.expert (testnet). */
export function ExplorerLink({ txHash }: { txHash: string }) {
  return (
    <a
      href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-current underline-offset-2 hover:underline"
    >
      View on stellar.expert <ExternalLink size={11} />
    </a>
  );
}
