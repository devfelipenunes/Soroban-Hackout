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
import type { PasskeyStep } from "../wallet/passkey-engine.ts";
import { useMobileGameplay } from "../platform/viewport.ts";

export function Login(): ReactElement {
  const { t, language, toggleLanguage } = useLanguage();
  const mark = useRef<HTMLDivElement | null>(null);
  const wallet = useWallet();
  const navigate = useNavigate();
  const [gate, setGate] = useState(false);
  const [passkeyFlow, setPasskeyFlow] = useState<"create" | "connect" | null>(null);
  const [passkeyStep, setPasskeyStep] = useState<PasskeyStep>("credential");
  const mobileGameplay = useMobileGameplay();
  const mobilePasskeyLoading = mobileGameplay && passkeyFlow !== null;
  const connecting = wallet.state.phase === "checking";

  useEffect(() => {
    const onStep = (event: Event): void => {
      const step = (event as CustomEvent<{ step?: PasskeyStep }>).detail?.step;
      if (step !== undefined) setPasskeyStep(step);
    };
    window.addEventListener("breaker:passkey-step", onStep);
    return () => window.removeEventListener("breaker:passkey-step", onStep);
  }, []);

  useEffect(() => {
    if (wallet.state.phase !== "checking") setPasskeyFlow(null);
  }, [wallet.state.phase]);

  const startPasskey = (flow: "create" | "connect"): void => {
    setPasskeyFlow(flow);
    setPasskeyStep("credential");
    if (flow === "create") void wallet.createPasskey?.();
    else void wallet.connectPasskey?.();
  };

  useEffect(() => {
    if (!wallet.createPasskey) return;
    let cancelled = false;
    const warm = (): void => {
      if (cancelled) return;
      void import("../wallet/passkey-engine.ts")
        .then((module) => module.warmPasskeyWallet())
        .catch(() => {});
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm, { timeout: 500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(handle);
      };
    }
    const timer = window.setTimeout(warm, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [wallet.createPasskey]);

  useEffect(() => {
    if (wallet.state.phase !== "connected") return;
    navigate("/", { replace: true });
  }, [wallet.state.phase, navigate]);

  useEffect(() => {
    document.title = "Enter Meridian — BREAKER";
  }, []);

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
    <main className={"login" + (mobilePasskeyLoading ? " login--passkey-loading" : "")}>
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

      {!mobilePasskeyLoading && <button
        type="button"
        className="login__language"
        onClick={() => toggleLanguage(nextLanguage(language))}
        aria-label={`${languageCode(nextLanguage(language))} — ${t("language.label")}`}
      >
        {languageCode(nextLanguage(language))}
      </button>}

      <div className="login__inner">
        <div
          className="login__mark"
          ref={mark}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
        >
          <img
            className="login__logo"
            src="/images/brand/breaker-logo.webp"
            alt="BREAKER"
            fetchPriority="high"
          />
        </div>

        {mobilePasskeyLoading ? (
          <div className="login__loading" role="status" aria-label={t("wallet.connecting")} aria-busy="true">
            <span className="login__spinner" aria-hidden="true" />
          </div>
        ) : <>
        <div className="login__season-card" aria-label={t("home.eyebrow")}>
          <span className="login__season">{t("home.eyebrow")}</span>
        </div>
        <div className="login__actions">
          {wallet.createPasskey && (
            <div className="login__passkey-actions">
              <button
                type="button"
                className="login__button login__button--passkey"
                disabled={connecting}
                onClick={() => startPasskey("create")}
              >
                <svg className="login__passkey-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15 3a6 6 0 0 0-5.6 8.15L3 17.55V21h3.45l1.7-1.7v-1.8h1.8l1.55-1.55A6 6 0 1 0 15 3Zm2 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
                </svg>
                <span className="login__label">{t(connecting ? "wallet.connecting" : "wallet.passkey.create")}</span>
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
                <div className="login__passkey-progress" role="status" aria-live="polite">
                  <span className="login__spinner" aria-hidden="true" />
                  <span>{t(`wallet.passkey.step.${passkeyStep}`)}</span>
                  <small>{t("wallet.passkey.step.slow")}</small>
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
            <span className="login__label">{t(connecting ? "wallet.connecting" : "wallet.connect")}</span>
          </button>
        </div>

        <div className="login__divider" aria-hidden="true">
          <i />
        </div>

        <span className="login__enter">{t("login.enter")}</span>
        </>}
      </div>
      {gate && <Gate onClose={() => setGate(false)} />}
    </main>
  );
}
