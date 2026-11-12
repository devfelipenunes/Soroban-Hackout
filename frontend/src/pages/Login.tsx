import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
} from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../wallet/context.tsx";
import { Gate } from "../components/Gate.tsx";

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
  const [gate, setGate] = useState(false);
  const [passkeyFlow, setPasskeyFlow] = useState<"create" | "connect" | null>(null);
  const connecting = wallet.state.phase === "checking";

  useEffect(() => {
    if (wallet.state.phase !== "checking") setPasskeyFlow(null);
  }, [wallet.state.phase]);

  const startPasskey = (flow: "create" | "connect"): void => {
    setPasskeyFlow(flow);
    if (flow === "create") void wallet.createPasskey?.();
    else void wallet.connectPasskey?.();
  };

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
          {wallet.createPasskey && (
            <div
              className="login__passkey-actions"
              onPointerEnter={preloadPasskey}
              onFocus={preloadPasskey}
              onTouchStart={preloadPasskey}
            >
              <button
                type="button"
                className="login__button login__button--passkey"
                disabled={connecting}
                onClick={() => startPasskey("create")}
              >
                <svg className="login__passkey-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15 3a6 6 0 0 0-5.6 8.15L3 17.55V21h3.45l1.7-1.7v-1.8h1.8l1.55-1.55A6 6 0 1 0 15 3Zm2 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
                </svg>
                <span className="login__label">{t("wallet.passkey.create")}</span>
              </button>
              <button
                type="button"
                className="login__passkey-return"
                disabled={connecting}
                onClick={() => startPasskey("connect")}
              >
                {t("wallet.passkey.connect")}
              </button>
              {passkeyFlow !== null ? (
                <div
                  className="login__passkey-progress"
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                  aria-label={t("wallet.connecting")}
                >
                  <span className="login__spinner" aria-hidden="true" />
                </div>
              ) : null}
            </div>
          )}
          <button type="button" className="login__button login__button--wallet"
            disabled={connecting}
            onClick={() => {
              if (wallet.state.phase === "no-extension" || wallet.state.phase === "incompatible") setGate(true);
              else void wallet.connect();
            }}>
            <span className="login__label">{t("wallet.connect")}</span>
          </button>
        </div>

        <div className="login__divider" aria-hidden="true">
          <i />
        </div>

        <span className="login__enter">{t("login.enter")}</span>
      </div>
      {gate && <Gate onClose={() => setGate(false)} />}
    </main>
  );
}
