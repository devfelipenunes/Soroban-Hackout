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
import { ResponsiveImage } from "./ResponsiveImage.tsx";

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
    const node = panel.current;
    node?.focus();
    if (node === null) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Tab") return;

      const items = [
        ...node.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]'),
      ].filter((item) => item.getClientRects().length > 0);
      const first = items[0];
      const last = items[items.length - 1];

      if (!first || !last) {
        event.preventDefault();
        node.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === node)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
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
        <ResponsiveImage
          className="case-peek__art"
          src={levelImage(level.id)}
          alt=""
          sizes="(max-width: 700px) 100vw, 54rem"
          loading="eager"
          fetchPriority="high"
        />
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
