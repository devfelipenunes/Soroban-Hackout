import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
} from "react";
import { Link } from "react-router-dom";

import { useLanguage } from "../i18n/language.tsx";
import {
  choose,
  levelCode,
  levelImage,
  type Level,
} from "../levels/index.ts";
import { CasePeek } from "./CasePeek.tsx";





const cardArtPositions: Readonly<Record<number, string>> = {
  0: "35% center",
  1: "24% center",
  2: "82% center",
  3: "right center",
  4: "22% center",
  5: "center",
  6: "center",
  7: "28% center",
  8: "25% center",
  9: "center",
  10: "100% center",
  11: "right center",
  12: "center",
};

export function Mosaic({
  levels,
  solvedIds,
  lockedIds = new Set<number>(),
  comingSoonIds = new Set<number>(),
  trailer,
}: {
  levels: readonly Level[];
  solvedIds: ReadonlySet<number>;
  lockedIds?: ReadonlySet<number>;
  comingSoonIds?: ReadonlySet<number>;
  trailer?: ReactElement;
}): ReactElement {
  const { t, language } = useLanguage();
  const grid = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [peek, setPeek] = useState<{
    level: Level;
    locked: boolean;
  } | null>(null);

  const openCase = (
    level: Level,
    locked: boolean,
    event: MouseEvent<HTMLAnchorElement>,
  ): void => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();
    opener.current = event.currentTarget;
    setPeek({ level, locked });
  };

  const close = useCallback(() => {
    setPeek(null);
    opener.current?.focus();
  }, []);

  const peekOpen = peek !== null;

  useEffect(() => {
    if (!peekOpen) return;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [peekOpen, close]);

  useLayoutEffect(() => {
    const node = grid.current;
    if (node === null) return;

    const cards = [...node.querySelectorAll(".case-card")];

    node.classList.add("campaign-grid--armed");

    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        for (const card of cards) card.classList.add("is-in");
      });
    });

    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
    };
  }, [levels, trailer]);

  if (levels.length === 0) {
    return <p className="empty">{t("levels.empty")}</p>;
  }

  return (
    <>
      <div className="campaign-grid" ref={grid}>
        {levels.map((level, index) => {
          const name = choose(level.name, language);
          const summary = choose(level.summary, language);
          const solved = solvedIds.has(level.id);
          const locked = lockedIds.has(level.id);
          const comingSoon = comingSoonIds.has(level.id);
          const label = name?.text ?? `Level ${level.id}`;

          const openCard = (event: MouseEvent<HTMLAnchorElement>): void => {
            openCase(level, locked, event);
          };

          return (
            <Link
              key={level.id}
              to={`/level/${level.id}`}
              className={`case-card${locked ? " case-card--locked" : ""}`}
              aria-label={t("levels.open") + ": " + label}
              style={{
                "--card-index": index,
                "--card-art-position": cardArtPositions[level.id] ?? "center",
              } as CSSProperties}
              onClick={openCard}
            >
              <img
                className="case-card__art"
                src={levelImage(level.id)}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <span className="case-card__veil" aria-hidden="true" />

              <span className="case-card__tags">
                {level.id === 0 && (
                  <span className="case-card__tag">{t("home.prologue")}</span>
                )}
                {level.id === 5 && (
                  <span className="case-card__tag">{t("home.boss")}</span>
                )}
                {comingSoon ? (
                  <span className="case-card__tag">{t("home.season2.soon")}</span>
                ) : locked && (
                  <span className="case-card__tag">{t("home.caseLocked")}</span>
                )}
                {solved && (
                  <span className="case-card__solved" title={t("levels.solved")}>
                    ✓
                  </span>
                )}
              </span>

              <span className="case-card__body">
                <span className="case-card__code">{levelCode(level.id)}</span>
                <span className="case-card__name">{label}</span>
                {summary && <span className="case-card__summary">{summary.text}</span>}
              </span>
            </Link>
          );
        })}
        {trailer}
      </div>

      {peek !== null && (
        <CasePeek
          level={peek.level}
          locked={peek.locked}
          onClose={close}
        />
      )}
    </>
  );
}
