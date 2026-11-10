import { useEffect, useRef, type ReactElement } from "react";
import { Link } from "react-router-dom";

import { useLanguage } from "../i18n/language.tsx";
import {
  choose,
  levelCode,
  levelImage,
  type Level,
} from "../levels/index.ts";
import { Difficulty } from "./Difficulty.tsx";

export function CasePeek({
  level,
  locked = false,
  onClose,
}: {
  level: Level;
  locked?: boolean;
  onClose: () => void;
}): ReactElement {
  const { t, language } = useLanguage();
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  const name = choose(level.name, language);
  const summary = choose(level.summary, language);

  return (
    <div className="case-peek" role="presentation">
      <button
        type="button"
        className="case-peek__scrim"
        onClick={onClose}
        aria-label={t("home.peek.close")}
      />

      <article
        className="case-peek__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-peek-title"
        tabIndex={-1}
        ref={panel}
      >
        <img className="case-peek__art" src={levelImage(level.id)} alt="" />
        <div className="case-peek__veil" aria-hidden="true" />

        <button
          type="button"
          className="case-peek__close"
          onClick={onClose}
          aria-label={t("home.peek.close")}
        >
          ×
        </button>

        <div className="case-peek__body">
          <span className="case-peek__code">{levelCode(level.id)}</span>
          <h2 className="case-peek__title" id="case-peek-title">
            {name?.text ?? `Level ${level.id}`}
          </h2>

          {summary && <p className="case-peek__summary">{summary.text}</p>}

          <div className="case-peek__meta">
            <Difficulty value={level.difficulty} />
          </div>

          <div className="case-peek__actions">
            {locked ? (
              <button type="button" className="button" disabled>
                {t("home.peek.locked")}
              </button>
            ) : (
              <Link className="button" to={`/level/${level.id}`}>
                {t("home.peek.enter")}
              </Link>
            )}
            <button type="button" className="button button--secondary" onClick={onClose}>
              {t("home.peek.back")}
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
