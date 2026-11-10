import type { ReactElement } from "react";

import { useLanguage } from "../i18n/language.tsx";

export function Broken({ error, retry }: { error: Error; retry: () => void }): ReactElement {
  const { t } = useLanguage();

  return (
    <main id="main-content" className="content">
      <div className="envelope">
        <section className="box">
          <h1 className="box__title">{t("error.title")}</h1>
          <p className="box__note">{t("error.body")}</p>
          <p className="message message--error">{t("error.detail", { reason: error.message })}</p>
          <div className="buttons">
            <button type="button" className="button" onClick={retry}>
              {t("error.retry")}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
