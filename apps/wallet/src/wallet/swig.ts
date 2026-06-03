import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  type Connection,
} from "@solana/web3.js";
import {
  Actions,
  createEd25519AuthorityInfo,
  fetchNullableSwig,
  findSwigPda,
  getCreateSwigInstruction,
  getSwigWalletAddress,
  type Swig,
} from "@swig-wallet/classic";

export interface SwigSession {
  authority: Keypair;
  swigId: Uint8Array;
  swigAccountAddress: PublicKey;
  walletAddress: PublicKey;
  swig: Swig;
  roleId: number;
}

export class AirdropError extends Error {
  constructor(msg: string, public readonly cause?: unknown) {
    super(msg);
    this.name = "AirdropError";
  }
}

const AIRDROP_AMOUNTS_SOL = [1, 0.5, 0.25];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function requestAirdrop(
  connection: Connection,
  pubkey: PublicKey,
): Promise<{ signature: string; amountSol: number }> {
  let lastErr: unknown = null;
  for (let i = 0; i < AIRDROP_AMOUNTS_SOL.length; i++) {
    const sol = AIRDROP_AMOUNTS_SOL[i]!;
    try {
      const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
      const block = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction(
        { signature: sig, blockhash: block.blockhash, lastValidBlockHeight: block.lastValidBlockHeight },
        "confirmed",
      );
      return { signature: sig, amountSol: sol };
    } catch (e) {
      lastErr = e;
      if (i < AIRDROP_AMOUNTS_SOL.length - 1) await sleep(1500);
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new AirdropError(
    `Devnet faucet rate-limited. Try again in a minute or use https://faucet.solana.com (${detail}).`,
    lastErr,
  );
}

export interface ProvisionProgress {
  step: "checking" | "creating" | "resolving" | "done";
  message: string;
}

/**
 * Lazy on-chain Swig PDA creation. Returns a fully-resolved SwigSession.
 * Caller must ensure the authority has SOL before invoking (we don't auto-airdrop here).
 */
export async function provisionSwig(
  connection: Connection,
  authority: Keypair,
  swigId: Uint8Array,
  onProgress?: (p: ProvisionProgress) => void,
): Promise<SwigSession> {
  const swigAccountAddress = findSwigPda(swigId);

  onProgress?.({ step: "checking", message: "Checking smart wallet on-chain…" });
  let swig = await fetchNullableSwig(connection, swigAccountAddress);

  if (!swig) {
    const balance = await connection.getBalance(authority.publicKey);
    if (balance < 0.02 * LAMPORTS_PER_SOL) {
      throw new AirdropError(
        "Authority has no devnet SOL. Run an airdrop before creating the smart wallet.",
      );
    }

    onProgress?.({ step: "creating", message: "Creating Swig PDA on-chain…" });
    const rootActions = Actions.set().all().get();
    const authorityInfo = createEd25519AuthorityInfo(authority.publicKey);
    const createIx = await getCreateSwigInstruction({
      payer: authority.publicKey,
      id: swigId,
      actions: rootActions,
      authorityInfo,
    });

    const tx = new Transaction().add(createIx);
    await sendAndConfirmTransaction(connection, tx, [authority], { commitment: "confirmed" });

    swig = await fetchNullableSwig(connection, swigAccountAddress);
    if (!swig) throw new Error("Swig creation succeeded but on-chain fetch returned null");
  }

  onProgress?.({ step: "resolving", message: "Resolving smart wallet address…" });
  const walletAddress = await getSwigWalletAddress(swig);

  onProgress?.({ step: "done", message: "Smart wallet ready." });
  return { authority, swigId, swigAccountAddress, walletAddress, swig, roleId: 0 };
}

export async function isSwigOnChain(
  connection: Connection,
  swigId: Uint8Array,
): Promise<boolean> {
  const pda = findSwigPda(swigId);
  const swig = await fetchNullableSwig(connection, pda);
  return swig !== null;
}
