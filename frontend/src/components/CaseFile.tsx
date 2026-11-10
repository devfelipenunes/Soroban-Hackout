import type { ReactElement } from "react";

import { useLanguage } from "../i18n/language.tsx";
import type { CaseFile } from "../levels/casefile.ts";
import { levelCode, type Level } from "../levels/index.ts";
import type { CaseNarrative } from "../levels/useCaseNarrative.ts";
import type { Narrative, NarrativeText } from "../levels/narrative.ts";

function CodeText({ text }: { text: string }): ReactElement {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((part, index) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code key={index}>{part.slice(1, -1)}</code>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function CaseFileBody({
  level,
  caseFile,
  narrative,
  player,
  instance,
  solved,
  state,
  onClose,
}: {
  level: Level;
  caseFile: CaseFile | null;
  narrative: Narrative | null;
  player: string | undefined;
  instance: string | undefined;
  solved: boolean;
  state: CaseNarrative;
  onClose?: () => void;
}): ReactElement {
  const { t, language } = useLanguage();

  const pick = (text: NarrativeText): string => text[language] ?? text["pt-BR"];

  const fill = (text: string): string =>
    text
      .replaceAll("{player}", player ?? "NO PLAYER")
      .replaceAll("{instance}", instance ?? "NO INSTANCE");

  const evidence =
    narrative === null
      ? []
      : narrative.evidence.filter((item) => state.revealed.has(item.id));

  const hints = narrative?.hints ?? [];
  const visibleHints = hints.slice(0, state.hintLevel);

  if (caseFile === null) {
    return <p className="casefile__empty">{t("casefile.empty")}</p>;
  }

  return (
    <div className="casefile__body">
      <p className="casefile__counts">
        {t("casefile.summary", {
          known: caseFile.known.length,
          unknown: caseFile.unknown.length,
          evidence: evidence.length,
        })}
      </p>

      <dl className="casefile__meta">
        <div>
          <dt>{t("casefile.objective")}</dt>
          <dd>{fill(pick(caseFile.objective))}</dd>
        </div>
        <div>
          <dt>{t("casefile.target")}</dt>
          <dd>{fill(pick(caseFile.target))}</dd>
        </div>
        <div>
          <dt>{t("casefile.owner")}</dt>
          <dd>{fill(pick(caseFile.owner))}</dd>
        </div>
        <div>
          <dt>{t("casefile.network")}</dt>
          <dd>{fill(pick(caseFile.network))}</dd>
        </div>
      </dl>

      <section className="casefile__section">
        <h3 className="casefile__title">{t("casefile.known")}</h3>
        <ul className="casefile__list">
          {caseFile.known.map((fact, index) => (
            <li key={`known-${index}`}>
              <CodeText text={fill(pick(fact))} />
            </li>
          ))}
        </ul>
      </section>

      <section className="casefile__section">
        <h3 className="casefile__title">{t("casefile.unknown")}</h3>
        <ul className="casefile__list casefile__list--question">
          {caseFile.unknown.map((question, index) => (
            <li key={`unknown-${index}`}>
              <CodeText text={fill(pick(question))} />
            </li>
          ))}
        </ul>
      </section>

      <section className="casefile__section">
        <h3 className="casefile__title">{t("casefile.evidence")}</h3>
        {evidence.length === 0 ? (
          <p className="casefile__empty">{t("casefile.noEvidence")}</p>
        ) : (
          <ul className="casefile__evidence">
            {evidence.map((item) => (
              <li key={item.id}>
                <span className="casefile__label">{fill(pick(item.label))}</span>
                <span className="casefile__value">{fill(pick(item.value))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="casefile__section">
        <h3 className="casefile__title">{t("casefile.reading")}</h3>
        <ul className="casefile__list">
          {caseFile.reading.map((item, index) => (
            <li key={`reading-${index}`}>
              <CodeText text={fill(pick(item))} />
            </li>
          ))}
        </ul>
      </section>

      <section className="casefile__section">
        <h3 className="casefile__title">{t("casefile.hints")}</h3>

        {visibleHints.length === 0 ? (
          <p className="casefile__empty">{t("casefile.hintsEmpty")}</p>
        ) : (
          <ol className="casefile__list casefile__list--hints">
            {visibleHints.map((hint, index) => {
              const event = state.hints.find((item) => item.index === index);
              return (
                <li key={`hint-${index}`}>
                  <CodeText text={fill(pick(hint))} />
                  {event && (
                    <span className="casefile__hint-time">
                      {new Date(event.at).toLocaleTimeString(language, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {event.source === "stuck" ? ` · ${t("casefile.hintStuck")}` : ""}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {state.assisted && (
          <p className="casefile__assisted">{t("casefile.assisted")}</p>
        )}

        {state.hintLevel < Math.min(3, hints.length) ? (
          <button
            type="button"
            className="button button--secondary casefile__hint"
            onClick={state.requestHint}
          >
            {t("casefile.hint")}
          </button>
        ) : (
          <p className="casefile__empty">{t("casefile.hintMax")}</p>
        )}
      </section>

      <div className="casefile__actions">
        {solved && (
          <a className="casefile__link" href="#debrief" onClick={onClose}>
            {t("casefile.debrief")}
          </a>
        )}

        <button type="button" className="casefile__clear" onClick={state.clear}>
          {t("casefile.clear")}
        </button>
      </div>

      <p className="casefile__empty">
        CASE {levelCode(level.id)} · {t("casefile.title")}
      </p>
    </div>
  );
}
