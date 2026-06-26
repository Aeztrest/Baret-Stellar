import {
  isProtoMessage,
  newRequestId,
  PROTO_VERSION,
  type ConnectRequestMessage,
  type PopupOutgoing,
  type SignRequestMessage,
} from "./protocol";

export class WalletAdapterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "WalletAdapterError";
  }
}

export interface BaretAdapterOptions {
  /** Origin of the wallet, e.g. http://localhost:5180 */
  walletUrl: string;
  /** Optional human-readable dApp name shown in the wallet's consent UI. */
  appName?: string;
  /** How long to wait for the popup to respond (ms). Default 5 min. */
  timeoutMs?: number;
  /** Popup window features. Override only if you know what you're doing. */
  popupFeatures?: string;
}

export interface ConnectedAccount {
  /** Smart-wallet address — assets live here. Use as `source` in Stellar ops. */
  walletAddress: string;
  /** Authority `G…` key — signs auth entries via Passkey / sub-key. */
  authorityAddress: string;
  /** Smart-wallet contract address — same family as `walletAddress`. */
  smartWalletAddress: string;
}

const DEFAULT_TIMEOUT = 5 * 60_000;
const DEFAULT_FEATURES = "popup=yes,width=440,height=720,top=80,left=80";

type Listener = (msg: PopupOutgoing) => void;

/**
 * dApp-side adapter for the Baret wallet (Stellar build). Opens popups
 * to the wallet's /connect and /sign routes; handshakes via postMessage;
 * returns signed `TransactionEnvelope` XDRs.
 *
 * Every signature is gated by the wallet's policy. The wallet runs the
 * Baret analysis and shows it to the user before allowing the sign —
 * this adapter cannot bypass that, by design.
 *
 * The transport is XDR strings (base64). Callers serialize / deserialize via
 * `tx.toXDR()` / `TransactionBuilder.fromXDR(xdr, passphrase)` so this
 * package itself does not need to depend on the Stellar SDK at runtime.
 */
export class BaretAdapter {
  private account: ConnectedAccount | null = null;

  constructor(private readonly opts: BaretAdapterOptions) {
    if (!opts.walletUrl)
      throw new WalletAdapterError("walletUrl is required", "INVALID_CONFIG");
  }

  get connected(): boolean {
    return this.account !== null;
  }
  get connectedAccount(): ConnectedAccount | null {
    return this.account;
  }
  get walletOrigin(): string {
    try {
      return new URL(this.opts.walletUrl).origin;
    } catch {
      throw new WalletAdapterError(
        `Invalid walletUrl: ${this.opts.walletUrl}`,
        "INVALID_CONFIG",
      );
    }
  }

  /**
   * Open the wallet's /connect popup and resolve when the user approves.
   * Throws WalletAdapterError on rejection or timeout.
   */
  async connect(): Promise<ConnectedAccount> {
    const requestId = newRequestId();
    const popup = this.openPopup(
      `${this.opts.walletUrl}/connect`,
      "baret-connect",
    );

    const result = await this.handshake(popup, requestId, () => {
      const req: ConnectRequestMessage = {
        __bt: PROTO_VERSION,
        type: "connect-request",
        requestId,
        origin: window.location.origin,
        appName: this.opts.appName,
      };
      popup.postMessage(req, this.walletOrigin);
    });

    if (result.type !== "connect-approved") {
      const reason = (result as { reason?: string }).reason ?? "User declined";
      throw new WalletAdapterError(reason, "CONNECT_REJECTED");
    }

    this.account = {
      walletAddress: result.walletAddress,
      authorityAddress: result.authorityAddress,
      smartWalletAddress: result.smartWalletAddress,
    };
    return this.account;
  }

  disconnect(): void {
    this.account = null;
  }

  /**
   * Pop up the wallet's /sign route, hand it the unsigned tx XDR, and
   * resolve with the signed XDR once the user approves the Baret review.
   */
  async signTransaction(transactionXdr: string): Promise<string> {
    if (!this.connected)
      throw new WalletAdapterError("Wallet not connected", "NOT_CONNECTED");
    const result = await this.requestSign(transactionXdr, "sign");
    return result.signedTransactionXdr;
  }

  /**
   * Same as signTransaction, but also asks the wallet to broadcast via
   * Horizon. Returns the Horizon tx hash.
   */
  async signAndSendTransaction(
    transactionXdr: string,
  ): Promise<{ signature: string; signedTransactionXdr: string }> {
    if (!this.connected)
      throw new WalletAdapterError("Wallet not connected", "NOT_CONNECTED");
    const result = await this.requestSign(transactionXdr, "signAndSend");
    if (!result.signature)
      throw new WalletAdapterError(
        "Wallet did not return a signature",
        "NO_SIGNATURE",
      );
    return {
      signature: result.signature,
      signedTransactionXdr: result.signedTransactionXdr,
    };
  }

  private async requestSign(
    transactionXdr: string,
    mode: "sign" | "signAndSend",
  ) {
    const requestId = newRequestId();
    const popup = this.openPopup(
      `${this.opts.walletUrl}/sign`,
      "baret-sign",
    );

    const result = await this.handshake(popup, requestId, () => {
      const req: SignRequestMessage = {
        __bt: PROTO_VERSION,
        type: "sign-request",
        requestId,
        origin: window.location.origin,
        appName: this.opts.appName,
        transactionXdr,
        mode,
      };
      popup.postMessage(req, this.walletOrigin);
    });

    if (result.type === "sign-approved") return result;
    const reason = (result as { reason?: string }).reason ?? "User cancelled";
    throw new WalletAdapterError(reason, "SIGN_REJECTED");
  }

  /* ────────────── internals ────────────── */

  private openPopup(url: string, name: string): Window {
    const popup = window.open(
      url,
      name,
      this.opts.popupFeatures ?? DEFAULT_FEATURES,
    );
    if (!popup) {
      throw new WalletAdapterError(
        "Popup blocked by browser. Allow popups for this site to use Baret.",
        "POPUP_BLOCKED",
      );
    }
    popup.focus();
    return popup;
  }

  private handshake(
    popup: Window,
    requestId: string,
    sendRequest: () => void,
  ): Promise<PopupOutgoing> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        try {
          popup.close();
        } catch {
          /* ignore */
        }
        reject(new WalletAdapterError("Wallet popup timed out", "TIMEOUT"));
      }, this.opts.timeoutMs ?? DEFAULT_TIMEOUT);

      const closedTimer = window.setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(
            new WalletAdapterError(
              "User closed wallet popup",
              "POPUP_CLOSED",
            ),
          );
        }
      }, 400);

      const listener: Listener = (raw: PopupOutgoing) => {
        if (raw.requestId !== requestId) return;
        cleanup();
        try {
          popup.close();
        } catch {
          /* ignore */
        }
        resolve(raw);
      };

      const handleMessage = (ev: MessageEvent) => {
        if (ev.origin !== this.walletOrigin) return;
        if (!isProtoMessage(ev.data)) return;
        const msg = ev.data as PopupOutgoing;
        if (msg.requestId !== requestId) return;
        // Popup-ready triggers our request payload; subsequent messages resolve.
        if (msg.type === "popup-ready") {
          sendRequest();
          return;
        }
        listener(msg);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        clearInterval(closedTimer);
        window.removeEventListener("message", handleMessage);
      };

      window.addEventListener("message", handleMessage);
    });
  }
}
