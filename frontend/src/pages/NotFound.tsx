import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import { useLanguage } from "../i18n/language.tsx";

export function NotFound(): ReactElement {
  const { t } = useLanguage();

  return (
    <main id="main-content" className="content">
      <div className="envelope not-found">
        <p className="not-found__code">404</p>
        <h1>{t("level.notFound")}</h1>
        <p>
          <Link to="/">{t("level.backToLevels")}</Link>
        </p>
      </div>
    </main>
  );
}
