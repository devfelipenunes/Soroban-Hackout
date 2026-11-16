import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
} from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../wallet/context.tsx";

import { Clouds } from "../components/Clouds.tsx";
import { ResponsiveImage } from "../components/ResponsiveImage.tsx";
import { Smoke } from "../components/Smoke.tsx";
import { useLanguage } from "../i18n/language.tsx";
import { languageCode, nextLanguage } from "../i18n/translate.ts";

export function Login(): ReactElement {
  const { t, language, toggleLanguage } = useLanguage();
  const mark = useRef<HTMLDivElement | null>(null);
  const wallet = useWallet();
  const navigate = useNavigate();
  const [passkeyFlow, setPasskeyFlow] = useState<"create" | "connect" | null>(null);
  const connecting = wallet.state.phase === "checking";
  const failed = wallet.state.phase === "failed" ? wallet.state : null;

  useEffect(() => {
    if (wallet.state.phase === "disconnected" || wallet.state.phase === "connected") {
      setPasskeyFlow(null);
    }
  }, [wallet.state.phase]);

  const startPasskey = (flow: "create" | "connect"): void => {
    setPasskeyFlow(flow);
    if (flow === "create") void wallet.createPasskey?.();
    else void (wallet.connectPasskey ?? wallet.connect)();
  };

  const retryKind: "create" | "connect" =
    passkeyFlow === "create" && wallet.createPasskey !== null ? "create" : "connect";
  const otherKind: "create" | "connect" = retryKind === "create" ? "connect" : "create";
  const otherPasskey =
    otherKind === "create"
      ? wallet.createPasskey
      : (wallet.connectPasskey ?? wallet.connect);

  const preloadPasskey = (): void => {
    void import("../wallet/passkey-engine.ts").catch(() => {});
  };

  useEffect(() => {
    if (wallet.state.phase !== "connected") return;
    navigate("/", { replace: true });
  }, [wallet.state.phase, navigate]);

  useEffect(() => {
    document.title = `${t("login.enter")} — BREAKER`;
  }, [t]);

  const setTilt = (x: string, y: string, glowX: string, glowY: string): void => {
    const node = mark.current;
    if (node === null) return;

    node.style.setProperty("--tilt-x", x);
    node.style.setProperty("--tilt-y", y);
    node.style.setProperty("--glow-x", glowX);
    node.style.setProperty("--glow-y", glowY);
  };

  const onMove = (event: PointerEvent<HTMLDivElement>): void => {
    const node = mark.current;
    if (node === null) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;

    setTilt(`${(x * 9).toFixed(2)}deg`, `${(-y * 6).toFixed(2)}deg`, `${(x * 22).toFixed(1)}%`, `${(y * 16).toFixed(1)}%`);
  };

  const onLeave = (): void => setTilt("0deg", "0deg", "0%", "0%");

  return (
    <main className="login">
      <ResponsiveImage
        className="login__backdrop"
        src="/images/login/meridian.webp"
        alt=""
        sizes="100vw"
        loading="eager"
        fetchPriority="high"
      />
      <Smoke />
      <Clouds />
      <div className="login__veil" aria-hidden="true" />
      <div className="login__atmosphere" aria-hidden="true">
        <span className="login__beam login__beam--a" />
        <span className="login__beam login__beam--b" />
        <span className="login__dust" />
      </div>
      <div className="login__blackout" aria-hidden="true" />

      <button
        type="button"
        className="login__language"
        onClick={() => toggleLanguage(nextLanguage(language))}
        aria-label={`${languageCode(language)} — ${t("language.label")}`}
        title={`${languageCode(language)} — ${t("language.label")}`}
      >
        {languageCode(language)}
      </button>

      <div className="login__inner">
        <div
          className="login__mark"
          ref={mark}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
        >
          <ResponsiveImage
            className="login__logo"
            src="/images/brand/breaker-logo.webp"
            alt="BREAKER"
            sizes="(max-width: 640px) 100vw, 37rem"
            loading="eager"
            fetchPriority="high"
          />
        </div>

        <div className="login__season-card" aria-label={t("home.eyebrow")}>
          <span className="login__season">{t("home.eyebrow")}</span>
        </div>
        <div className="login__actions">
          <div
            className="login__passkey-actions"
            onPointerEnter={preloadPasskey}
            onFocus={preloadPasskey}
            onTouchStart={preloadPasskey}
          >
            {failed !== null ? (
              <div className="login__passkey-failed" role="alert">
                <p className="login__passkey-error-title">{t("wallet.failed.title")}</p>
                <p className="login__passkey-error">{failed.reason}</p>
                <button
                  type="button"
                  className="login__button login__button--passkey login__passkey-retry"
                  disabled={connecting}
                  onClick={() => startPasskey(retryKind)}
                >
                  {t("wallet.tryAgain")}
                </button>
                {otherPasskey && (
                  <button
                    type="button"
                    className="login__passkey-return"
                    disabled={connecting}
                    onClick={() => startPasskey(otherKind)}
                  >
                    {t(
                      otherKind === "create"
                        ? "wallet.passkey.create"
                        : "wallet.passkey.connect",
                    )}
                  </button>
                )}
              </div>
            ) : passkeyFlow !== null ? (
              <div
                className="login__passkey-progress"
                role="status"
                aria-live="polite"
                aria-busy="true"
                aria-label={t("wallet.connecting")}
              >
                <span className="login__spinner" aria-hidden="true" />
              </div>
            ) : (
              <>
                {wallet.createPasskey && (
                  <button
                    type="button"
                    className="login__button login__button--passkey"
                    disabled={connecting}
                    onClick={() => startPasskey("create")}
                  >
                    <span className="login__label">{t("wallet.passkey.create")}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="login__passkey-return"
                  disabled={connecting}
                  onClick={() => startPasskey("connect")}
                >
                  {t("wallet.passkey.connect")}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="login__divider" aria-hidden="true">
          <i />
        </div>

        <span className="login__enter">{t("login.enter")}</span>
      </div>
    </main>
  );
}
