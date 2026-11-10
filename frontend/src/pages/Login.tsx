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
import { Smoke } from "../components/Smoke.tsx";
import { useLanguage } from "../i18n/language.tsx";
import { languageCode, nextLanguage } from "../i18n/translate.ts";

export function Login(): ReactElement {
  const { t, language, toggleLanguage } = useLanguage();
  const mark = useRef<HTMLDivElement | null>(null);
  const wallet = useWallet();
  const navigate = useNavigate();
  const [gate, setGate] = useState(false);
  const connecting = wallet.state.phase === "checking";

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
    <main className="login">
      <img className="login__backdrop" src="/images/login/meridian.webp" alt="" />
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
        aria-label={t("language.label")}
      >
        {languageCode(nextLanguage(language))}
      </button>

      <div className="login__inner">
        <div
          className="login__mark"
          ref={mark}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
        >
          <img className="login__logo" src="/images/brand/breaker-logo.webp" alt="BREAKER" />
        </div>

        <div className="login__season-card" aria-label={t("home.eyebrow")}>
          <span className="login__season">{t("home.eyebrow")}</span>
        </div>
        <div className="login__actions">
          <button type="button" className="login__button login__button--wallet"
            disabled={connecting}
            onClick={() => {
              if (wallet.state.phase === "no-extension" || wallet.state.phase === "incompatible") setGate(true);
              else void wallet.connect();
            }}>
            <span className="login__label">{t(connecting ? "wallet.connecting" : "wallet.connect")}</span>
          </button>
          {wallet.state.phase === "failed" && <p className="login__feedback" role="alert">{t("wallet.failed.title")} {wallet.state.reason}</p>}
          {wallet.state.phase === "wrong-network" && <p className="login__feedback" role="alert">{t("wallet.wrongNetwork.body")}</p>}
          {wallet.state.phase === "network-unverified" && <p className="login__feedback" role="alert">{t("wallet.networkUnverified.body")}</p>}
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
