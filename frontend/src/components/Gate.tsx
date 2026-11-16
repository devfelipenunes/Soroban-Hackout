import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";

import { useWallet, type Wallet, type WalletState } from "../wallet/context.tsx";
import { useLanguage } from "../i18n/language.tsx";

type Translator = ReturnType<typeof useLanguage>["t"];

export function shorten(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}

export function walletLabel(state: WalletState, t: Translator): string {
  switch (state.phase) {
    case "checking":
      return t("wallet.chip.checking");
    case "no-extension":
      return t("wallet.chip.noExtension");
    case "incompatible":
      return t("wallet.chip.incompatible");
    case "wrong-network":
      return t("wallet.chip.wrongNetwork");
    case "network-unverified":
      return t("wallet.chip.networkUnverified");
    case "connected":
      return shorten(state.address);
    case "disconnected":
      return t("wallet.passkey.connect");
    case "failed":
      return t("wallet.chip.failed");
  }
}

export function walletTone(state: WalletState): string {
  switch (state.phase) {
    case "connected":
      return " wallet-chip--ok";
    case "wrong-network":
    case "network-unverified":
      return " wallet-chip--notice";
    case "no-extension":
    case "incompatible":
    case "failed":
      return " wallet-chip--error";
    default:
      return "";
  }
}

function Icon({ state }: { state: WalletState }): ReactElement {
  const glyph: Record<WalletState["phase"], string> = {
    checking: "◌",
    "no-extension": "⌧",
    incompatible: "⊘",
    "wrong-network": "⇄",
    "network-unverified": "?",
    disconnected: "○",
    connected: "●",
    failed: "✕",
  };

  return (
    <p className={"gate__icon" + (state.phase === "checking" ? " pulse" : "")}>
      {glyph[state.phase]}
    </p>
  );
}

export function Gate({ onClose }: { onClose: () => void }): ReactElement {
  const { t } = useLanguage();
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const close = useRef(onClose);
  const dialog = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key === "Tab") {
        const items = [...(dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], [tabindex="0"]',
        ) ?? [])].filter((item) => item.getClientRects().length > 0);
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) {
          event.preventDefault();
          dialog.current?.focus();
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (wallet.state.phase !== "connected" || busy) return;
    close.current();
  }, [wallet.state.phase, busy]);

  const withBusy = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="veil" role="presentation" onClick={() => close.current()}>
      <div
        ref={dialog}
        tabIndex={-1}
        className="gate"
        role="dialog"
        aria-modal="true"
        aria-label={t("wallet.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="gate__close"
          onClick={() => close.current()}
          aria-label={t("common.close")}
        >
          ✕
        </button>

        <Body
          wallet={wallet}
          busy={busy}
          t={t}
          withBusy={withBusy}
        />
      </div>

    </div>
  );
}

function Body({
  wallet,
  busy,
  t,
  withBusy,
}: {
  wallet: Wallet;
  busy: boolean;
  t: Translator;
  withBusy: (action: () => Promise<void>) => Promise<void>;
}): ReactElement {
  const { state } = wallet;
  const createPasskey = wallet.createPasskey;
  const [lastAction, setLastAction] = useState<"create" | "connect">("connect");
  const retry =
    lastAction === "create" && createPasskey
      ? createPasskey
      : (wallet.connectPasskey ?? wallet.connect);
  const otherAction =
    lastAction === "create"
      ? (wallet.connectPasskey ?? wallet.connect)
      : createPasskey;
  const otherKind: "create" | "connect" = lastAction === "create" ? "connect" : "create";

  if (busy || state.phase === "checking") {
    return (
      <>
        <Icon state={{ phase: "checking" }} />
        <h2 className="gate__title">
          {busy ? t("wallet.connecting") : t("wallet.checking")}
        </h2>
        <p className="gate__body">{t("wallet.disconnected.body")}</p>
      </>
    );
  }

  if (state.phase === "connected") return <p>{t("wallet.connected")}</p>;

  if (state.phase === "failed") {
    return (
      <>
        <Icon state={state} />
        <h2 className="gate__title">{t("wallet.failed.title")}</h2>
        <p className="gate__detail">{state.reason}</p>
        <div className="gate__actions">
          <button
            type="button"
            className="button"
            onClick={() => void withBusy(retry)}
          >
            {t("wallet.tryAgain")}
          </button>
          {otherAction && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setLastAction(otherKind);
                void withBusy(otherAction);
              }}
            >
              {t(
                otherKind === "create"
                  ? "wallet.passkey.create"
                  : "wallet.passkey.connect",
              )}
            </button>
          )}
        </div>
        <p className="gate__note">{t("footer.notice")}</p>
      </>
    );
  }

  return (
    <>
      <Icon state={state} />
      <h2 className="gate__title">{t("wallet.disconnected.title")}</h2>
      <p className="gate__body">{t("wallet.disconnected.body")}</p>
      <div className="gate__actions">
        {createPasskey && (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              setLastAction("create");
              void withBusy(createPasskey);
            }}
          >
            {t("wallet.passkey.create")}
          </button>
        )}
        <button
          type="button"
          className="button"
          onClick={() => {
            setLastAction("connect");
            void withBusy(wallet.connectPasskey ?? wallet.connect);
          }}
        >
          {t("wallet.passkey.connect")}
        </button>
      </div>

      <p className="gate__note">{t("footer.notice")}</p>
    </>
  );
}
