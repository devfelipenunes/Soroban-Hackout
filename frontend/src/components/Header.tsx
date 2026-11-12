import { lazy, Suspense, useEffect, useRef, useState, type ReactElement } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useWallet } from "../wallet/context.tsx";
import { useLanguage } from "../i18n/language.tsx";
import { languageCode, nextLanguage } from "../i18n/translate.ts";
import { DEPLOYMENT_PROFILE } from "../chain/network.ts";
import { Gate, walletLabel, walletTone } from "./Gate.tsx";
import { loadChunk } from "./Boundary.tsx";
import type { OsFocus } from "./BreakerDevice.tsx";

const GlobalBreakerDevice = lazy(() =>
  loadChunk(() =>
    import("./BreakerDevice.tsx").then(({ GlobalBreakerDevice: Device }) => ({ default: Device })),
  ),
);

function homeNotificationCount(player: string | undefined): number {
  try {
    const raw = window.localStorage.getItem(`breaker.os.seen.${player ?? "anon"}.-1`);
    if (raw === null) return 1;
    const parsed: unknown = JSON.parse(raw);
    const comms =
      typeof parsed === "object" && parsed !== null && "comms" in parsed && typeof parsed.comms === "number"
        ? parsed.comms
        : 0;
    return Number.isFinite(comms) ? Math.max(0, 1 - Math.trunc(comms)) : 1;
  } catch {
    return 1;
  }
}

export function Header(): ReactElement {
  const { t, language, toggleLanguage } = useLanguage();
  const { state } = useWallet();
  const [gate, setGate] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname, state: navigationState } = useLocation();
  const navigate = useNavigate();
  const openConversation = typeof navigationState === "object" && navigationState !== null && "breakerConversation" in navigationState && navigationState.breakerConversation === true;
  const [osOpen, setOsOpen] = useState(false);
  const [caseDeviceOpen, setCaseDeviceOpen] = useState(false);
  const [homeUnread, setHomeUnread] = useState(0);
  const [notifications, setNotifications] = useState<{ levelId: number; count: number } | null>(null);
  const [osFocus, setOsFocus] = useState<OsFocus | null>(null);
  const deviceDialog = useRef<HTMLDialogElement>(null);
  const inCase = pathname.startsWith("/level/");

  const playerAddress = state.phase === "connected" ? state.address : undefined;
  const unread = inCase ? notifications?.levelId === Number(pathname.split("/")[2]) ? notifications.count : 0 : state.phase === "connected" ? homeUnread : 0;
  useEffect(() => { setHomeUnread(homeNotificationCount(playerAddress)); }, [playerAddress]);

  useEffect(() => {
    const receive = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (typeof detail !== "object" || detail === null || !("levelId" in detail) || !("count" in detail)) return;
      if (typeof detail.levelId !== "number" || typeof detail.count !== "number") return;
      setNotifications({ levelId: detail.levelId, count: detail.count });
      if (detail.levelId === -1) setHomeUnread(detail.count);
    };
    window.addEventListener("breaker:unread", receive);
    return () => window.removeEventListener("breaker:unread", receive);
  }, []);

  useEffect(() => {
    const visibility = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (typeof detail === "object" && detail !== null && "open" in detail && typeof detail.open === "boolean") setCaseDeviceOpen(detail.open);
    };
    window.addEventListener("breaker:visibility", visibility);
    return () => window.removeEventListener("breaker:visibility", visibility);
  }, []);

  useEffect(() => {
    const open = (): void => {
      if (inCase) return;
      if (state.phase !== "connected") { setGate(true); return; }
      setOsFocus({ app: "home", at: Date.now() });
      setOsOpen(true);
    };
    window.addEventListener("breaker:open-os", open);
    return () => window.removeEventListener("breaker:open-os", open);
  }, [inCase, state.phase]);

  useEffect(() => { setOsOpen(false); }, [pathname]);
  useEffect(() => { if (state.phase !== "connected") setOsOpen(false); }, [state.phase]);
  useEffect(() => {
    const node = deviceDialog.current;
    if (!osOpen || !node || inCase) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    return () => { node.close(); document.body.style.overflow = overflow; };
  }, [osOpen, inCase]);

  useEffect(() => {
    if (!openConversation || inCase || state.phase !== "connected") return;
    setOsFocus({ app: "comms", at: Date.now() }); setOsOpen(true);
    navigate(pathname, { replace: true, state: null });
  }, [openConversation, inCase, state.phase, navigate, pathname]);

  const outroIdioma = nextLanguage(language);

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 8);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header className={`header${scrolled ? " header--scrolled" : ""}`}>
        <div className="envelope header__inner">
          <Link to="/" className="brand">
            <img
              className="brand__logo"
              src="/images/brand/breaker-logo.webp"
              alt={t("app.title")}
            />
          </Link>

          <div className="actions">
            <span className="environment-badge">
              {DEPLOYMENT_PROFILE === "sandbox"
                ? t("network.sandbox")
                : t("network.testnet")}
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={() => toggleLanguage(outroIdioma)}
              aria-label={`${languageCode(outroIdioma)} — ${t("language.label")}`}
              title={t("language.label")}
            >
              {languageCode(outroIdioma)}
            </button>

            <button
              type="button"
              className={
                "wallet-chip" +
                walletTone(state) +
                (state.phase === "checking" ? " pulse" : "") +
                (unread > 0 ? " wallet-chip--alert" : "")
              }
              data-breaker-os-toggle
              aria-expanded={inCase ? caseDeviceOpen : osOpen}
              aria-controls="breaker-os"
              onClick={() => {
                if (state.phase !== "connected") { setGate(true); return; }
                if (inCase) window.dispatchEvent(new Event("breaker:toggle-os"));
                else {
                  if (!osOpen) setOsFocus({ app: "home", at: Date.now() });
                  setOsOpen((previous) => !previous);
                }
              }}
              aria-label={state.phase === "connected" ? `BREAKER OS${unread > 0 ? `. ${t("device.unread", { count: unread })}` : ""}` : undefined}
            >
              <span className="wallet-chip__dot" />
              {state.phase === "connected" ? "BREAKER OS" : walletLabel(state, t)}
              {unread > 0 && <span className="wallet-chip__badge" aria-hidden="true">{unread}</span>}
            </button>
          </div>
        </div>
      </header>

      {gate && <Gate onClose={() => setGate(false)} />}
      {!inCase && <dialog className="breaker-device-dialog" ref={deviceDialog}
        aria-label="Breaker OS" onCancel={() => setOsOpen(false)}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOsOpen(false);
        }}>
        {osOpen && <Suspense fallback={null}><GlobalBreakerDevice onClose={() => setOsOpen(false)} focus={osFocus} /></Suspense>}
      </dialog>}
    </>
  );
}
