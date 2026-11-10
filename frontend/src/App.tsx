import { lazy, Suspense, useEffect, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useWallet } from "./wallet/context.tsx";
import { useLanguage } from "./i18n/language.tsx";

import { Header } from "./components/Header.tsx";
import { Boundary } from "./components/Boundary.tsx";
import { Broken } from "./pages/Broken.tsx";
const Home = lazy(() => import("./pages/Home.tsx").then(({ Home: Page }) => ({ default: Page })));
const Login = lazy(() => import("./pages/Login.tsx").then(({ Login: Page }) => ({ default: Page })));
const Help = lazy(() => import("./pages/Help.tsx").then(({ Help: Page }) => ({ default: Page })));
const NotFound = lazy(() => import("./pages/NotFound.tsx").then(({ NotFound: Page }) => ({ default: Page })));
const Level = lazy(() => import("./pages/Level.tsx").then(({ Level: Page }) => ({ default: Page })));
const Final = lazy(() => import("./pages/Final.tsx").then(({ Final: Page }) => ({ default: Page })));
const CaseStory = lazy(() => import("./pages/CaseStory.tsx").then(({ CaseStory: Page }) => ({ default: Page })));

function ScrollToTop(): null {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

export function App(): ReactElement {
  const { pathname } = useLocation();
  const wallet = useWallet();
  const { t } = useLanguage();
  const season =
    pathname === "/login" ||
    pathname === "/" ||
    pathname === "/final" ||
    pathname.startsWith("/case/");
  const overlay = pathname === "/" || pathname.startsWith("/level/");

  if (pathname === "/login") {
    return (
      <div className="app app--season">
        <Boundary
          key={pathname}
          fallback={(error, retry) => <Broken error={error} retry={retry} />}
        >
          <Suspense fallback={null}>
            <Login />
          </Suspense>
        </Boundary>
      </div>
    );
  }

  if (wallet.state.phase !== "connected") {
    return (
      <div className="app app--season">
        <Navigate to="/login" replace />
      </div>
    );
  }

  return (
    <div
      className={`app${season ? " app--season" : ""}${overlay ? " app--overlay" : ""}`}
    >
      <ScrollToTop />
      <Header />
      <a className="skip-link" href="#main-content">{t("app.skipToContent")}</a>

      <Boundary
        key={pathname}
        fallback={(error, retry) => <Broken error={error} retry={retry} />}
      >
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/level/:levelId" element={<Level />} />
            <Route path="/final" element={<Final />} />
            <Route path="/case/:levelId/story" element={<CaseStory />} />
            <Route path="/help" element={<Help />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Boundary>
    </div>
  );
}
