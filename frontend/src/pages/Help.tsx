import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import { useLanguage } from "../i18n/language.tsx";

const GLOBALS: readonly { name: string; key: string }[] = [
  { name: "window.player", key: "help.global.player" },
  { name: "window.instance", key: "help.global.instance" },
  { name: "window.contract", key: "help.global.contract" },
  { name: "window.aux", key: "help.global.aux" },
  { name: "window.help()", key: "help.global.help" },
];

const STEPS: readonly string[] = [
  "help.step1",
  "help.step2",
  "help.step3",
  "help.step4",
  "help.step5",
  "help.step6",
];

export function Help(): ReactElement {
  const { t } = useLanguage();

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
          <h2>{t("help.console.title")}</h2>
          <p>{t("help.console.body")}</p>

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
            {STEPS.map((key) => (
              <li key={key} className="step">
                <span>{t(key)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
