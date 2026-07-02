/**
 * Centered modal wrappers around the popup's Send/Receive screens so the
 * Options page can reuse the exact same flows without duplicating the form
 * logic. Backdrop click + ESC close.
 */

import { useEffect, type ReactNode } from "react";
import { SendScreen } from "../../popup/SendScreen";
import { ReceiveScreen } from "../../popup/ReceiveScreen";

interface SendProps {
  authorityAddress: string;
  network: string;
  balanceXlm: number | null;
  onClose: () => void;
  onSent: () => void | Promise<void>;
}

interface ReceiveProps {
  address: string;
  network: string;
  onClose: () => void;
}

function ModalShell({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(20,20,20,0.45)", backdropFilter: "blur(6px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative rounded-modal overflow-hidden shadow-2xl"
        style={{
          width: "100%",
          maxWidth: "420px",
          height: "640px",
          background: "var(--bg)",
          border: "1px solid var(--line)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function OptionsSendModal(props: SendProps) {
  return (
    <ModalShell onClose={props.onClose}>
      <SendScreen
        authorityAddress={props.authorityAddress}
        network={props.network}
        balanceXlm={props.balanceXlm}
        onClose={props.onClose}
        onSent={() => { void props.onSent(); }}
      />
    </ModalShell>
  );
}

export function OptionsReceiveModal(props: ReceiveProps) {
  return (
    <ModalShell onClose={props.onClose}>
      <ReceiveScreen
        address={props.address}
        network={props.network}
        onClose={props.onClose}
      />
    </ModalShell>
  );
}
