import { StrictMode, Suspense, lazy, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App.tsx";
import { Boundary } from "./components/Boundary.tsx";
import { Broken } from "./pages/Broken.tsx";
import { useWallet, WalletProvider } from "./wallet/context.tsx";
import type { WalletEngine } from "./wallet/engine.ts";
import { walletEngineForViewport } from "./wallet/mobile-engine.ts";
import { LanguageProvider } from "./i18n/language.tsx";
import { ProgressProvider } from "./game/progress.tsx";
import { migrateLegacyStorage } from "./game/storage.ts";

import "./styles/base.css";
import "./styles/passkey-mobile.css";

const AccountProvider = lazy(() =>
  import("./chain/account.tsx").then(({ AccountProvider: Provider }) => ({
    default: Provider,
  })),
);

function AccountLayer({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  if (wallet.state.phase !== "connected") return children;

  return (
    <Suspense fallback={null}>
      <AccountProvider>{children}</AccountProvider>
    </Suspense>
  );
}

const LOCAL_TEST_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const localTestEngine: WalletEngine = {
  testOnly: true,
  detect: async () => ({ kind: "available", wallet: "Local test wallet" }),
  connect: async () => ({
    address: LOCAL_TEST_ADDRESS,
    rightNetwork: true,
    signer: {
      signTransaction: async () => { throw new Error("The local test wallet never signs transactions."); },
      signAuthEntry: async () => { throw new Error("The local test wallet never signs auth entries."); },
    },
  }),
  disconnect: async () => {},
};

const useLocalTestWallet =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("breaker-test-wallet") === "1";
const walletEngine = useLocalTestWallet ? localTestEngine : walletEngineForViewport();

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root is missing from index.html");
}

migrateLegacyStorage();

if (import.meta.env.PROD && "caches" in window) {
  void caches.delete("breaker-shell-v1");
}

createRoot(root).render(
  <StrictMode>
    <LanguageProvider>
      <Boundary fallback={(error, retry) => <Broken error={error} retry={retry} />}>
        <WalletProvider engine={walletEngine}>
          <AccountLayer>
            <ProgressProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </ProgressProvider>
          </AccountLayer>
        </WalletProvider>
      </Boundary>
    </LanguageProvider>
  </StrictMode>,
);
