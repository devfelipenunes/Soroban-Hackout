import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import { useLanguage } from "../i18n/language.tsx";
import { useMobileGameplay } from "../platform/viewport.ts";

const GLOBALS: readonly { name: string; key: string }[] = [
  { name: "window.player", key: "help.global.player" },
  { name: "window.instance", key: "help.global.instance" },
  { name: "window.contract", key: "help.global.contract" },
  { name: "window.aux", key: "help.global.aux" },
  { name: "window.help()", key: "help.global.help" },
];

const STEPS: readonly { desktop: string; mobile: string }[] = [
  { desktop: "help.step1", mobile: "help.step1.mobile" },
  { desktop: "help.step2", mobile: "help.step2.mobile" },
  { desktop: "help.step3", mobile: "help.step3.mobile" },
  { desktop: "help.step4", mobile: "help.step4.mobile" },
  { desktop: "help.step5", mobile: "help.step5.mobile" },
  { desktop: "help.step6", mobile: "help.step6.mobile" },
];

export function Help(): ReactElement {
  const { t } = useLanguage();
  const mobileGameplay = useMobileGameplay();

  return (
    <main id="main-content" className="content">
      <div className="envelope">
        <div className="top">
          <div className="level__top">
            <h1 className="level__title">{t("help.title")}</h1>
            <Link className="back" to="/">
              ← {t("help.back")}
            </Link>
          </div>
        </div>

        <section className="help__section">
          <h2>{t(mobileGameplay ? "help.console.title.mobile" : "help.console.title")}</h2>
          <p>{t(mobileGameplay ? "help.console.body.mobile" : "help.console.body")}</p>

          <h2>{t("help.globals.title")}</h2>
          <p>{t("help.globals.body")}</p>
          <ul className="globals">
            {GLOBALS.map((global) => (
              <li key={global.name} className="global">
                <code className="global__name">{global.name}</code>
                <span className="global__desc">{t(global.key)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="help__section">
          <h2>{t("help.steps.title")}</h2>
          <ol className="steps">
            {STEPS.map((step) => (
              <li key={step.desktop} className="step">
                <span>{t(mobileGameplay ? step.mobile : step.desktop)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
