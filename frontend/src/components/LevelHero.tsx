import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from "react";
import { Link } from "react-router-dom";

import { loadBookChoice, saveBookChoice } from "../game/bookStore.ts";
import { useLanguage } from "../i18n/language.tsx";
import { paginateBookPages, type BookChoice, type BookChapter } from "../levels/book.ts";
import { levelCode, levelImage, loadBook, type Level } from "../levels/index.ts";
import type { LocalizedText } from "../levels/text.ts";
import type { Tone } from "../levels/narrative.ts";
import { Difficulty } from "./Difficulty.tsx";
import { ResponsiveImage } from "./ResponsiveImage.tsx";
import { Smoke } from "./Smoke.tsx";

const READER_SIZES = [1, 1.12, 1.25] as const;
const READER_KEY = "breaker.book.size";

function renderProse(text: string): ReactElement[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|“[^”]+”|"[^"]+")/g)
    .filter((part) => part.length > 0)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }

      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code className="level-hero__code" key={index}>
            {part.slice(1, -1)}
          </code>
        );
      }

      if ((part.startsWith("“") && part.endsWith("”")) || (part.startsWith('"') && part.endsWith('"'))) {
        return (
          <span className="level-hero__inline-dialogue" key={index}>
            {part}
          </span>
        );
      }

      return <span key={index}>{part}</span>;
    });
}

function proseClass(text: string): string | undefined {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("—")) return "is-dialogue";
  if (trimmed.includes("`") || /\b[A-Z][A-Z_]{3,}\b/.test(trimmed) && /(?:→|:|\/)/.test(trimmed)) return "is-terminal";
  if (trimmed.startsWith("“") || trimmed.startsWith("\"")) return "is-quote";
  if (
    /^(Até|Então|Mas|No entanto|A partir|O próximo|A investigação|But|Then|Until|The next|The investigation|Pero|Sin embargo|Entonces|Hasta|El próximo|La investigación)/.test(
      trimmed,
    )
  ) {
    return "is-turn";
  }
  return undefined;
}

export function LevelHero({
  level,
  kind,
  name,
  summary,
  lead,
  player,
  previousCompleted,
}: {
  level: Level;
  kind: string;
  name: string;
  summary: string | null;
  lead: LocalizedText | null;
  player: string | undefined;
  previousCompleted: boolean;
}): ReactElement {
  const { t, language } = useLanguage();
  const wrap = useRef<HTMLElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const slideNodes = useRef<HTMLElement[]>([]);
  const activeRef = useRef(0);
  const tweening = useRef(false);
  const wheelAccum = useRef(0);
  const lastWheel = useRef(0);

  const [book, setBook] = useState<BookChapter | null>(null);
  const [previous, setPrevious] = useState<BookChapter | null>(null);
  const [active, setActive] = useState(0);
  const [choice, setChoice] = useState<Tone | null>(null);
  const [readerSize, setReaderSize] = useState(0);
  const [introReady, setIntroReady] = useState(false);

  const recap = level.id > 0;
  const recapPages = previousCompleted
    ? paginateBookPages(
        previous === null
          ? []
          : [previous.continuation ?? previous.pages[previous.pages.length - 1]].filter(
              (page): page is NonNullable<typeof page> => page !== undefined,
            ),
      )
    : [];
  const storyIndex = recap ? 1 + recapPages.length : 1;
  const pagesStart = storyIndex + 1;
  const bookPages = paginateBookPages(book?.pages ?? []);
  const pages = bookPages.length;
  const choiceSlide: BookChoice | null =
    book?.choice !== undefined && book.choice.options.length > 0 ? book.choice : null;
  const count = pagesStart + pages + (choiceSlide === null ? 0 : 1);

  useEffect(() => {
    let alive = true;

    void loadBook(level.id).then((chapter) => {
      if (alive) setBook(chapter);
    });

    return () => {
      alive = false;
    };
  }, [level.id]);

  useEffect(() => {
    if (level.id === 0) {
      setPrevious(null);
      return;
    }

    let alive = true;

    void loadBook(level.id - 1).then((chapter) => {
      if (alive) setPrevious(chapter);
    });

    return () => {
      alive = false;
    };
  }, [level.id]);

  useEffect(() => {
    setChoice(loadBookChoice(player, level.id));
  }, [player, level.id]);

  useEffect(() => {
    try {
      const raw = Number(window.localStorage.getItem(READER_KEY));
      if (Number.isInteger(raw) && raw >= 0 && raw < READER_SIZES.length) {
        setReaderSize(raw);
      }
    } catch {
      void 0;
    }
  }, []);

  const cycleReader = (): void => {
    setReaderSize((current) => {
      const next = (current + 1) % READER_SIZES.length;

      try {
        window.localStorage.setItem(READER_KEY, String(next));
      } catch {
        void 0;
      }

      return next;
    });
  };

  const label = (index: number): string => {
    if (index === 0) return t("levelHero.art");
    if (recap && index > 0 && index < storyIndex) return t("levelHero.recap");
    if (index === storyIndex) return t("levelHero.storyStep");
    if (choiceSlide !== null && index === count - 1) return t("levelHero.choice");
    return `${t("levelHero.book")} — ${index - pagesStart + 1} / ${pages}`;
  };

  const paint = useCallback((pos: number): void => {
    const stageEl = stage.current;
    if (stageEl === null) return;

    slideNodes.current.forEach((node, index) => {
      const delta = index - pos;
      const incoming = Math.max(0, delta);
      const covered = Math.min(Math.max(pos - index, 0), 1);
      const x = Math.min(incoming, 1.2) * 100;
      const scale = 1 - covered * 0.06;
      const opacity = 1 - covered * 0.4;

      node.style.transform = `translate3d(${x.toFixed(3)}%, 0, 0) scale(${scale.toFixed(4)})`;
      node.style.opacity = opacity.toFixed(3);
      node.style.setProperty("--slide-offset", Math.max(-1.5, Math.min(1.5, delta)).toFixed(3));
    });

    const index = Math.round(pos);
    activeRef.current = index;
    setActive((current) => (current === index ? current : index));
  }, []);

  useLayoutEffect(() => {
    const stageEl = stage.current;
    if (stageEl === null) return;

    slideNodes.current = [
      ...stageEl.querySelectorAll<HTMLElement>(".level-hero__slide"),
    ];
    slideNodes.current.forEach((node, index) => {
      node.style.zIndex = String(index);
    });

    const wrapEl = wrap.current;
    const progress =
      wrapEl === null
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              -wrapEl.getBoundingClientRect().top /
                Math.max(1, wrapEl.offsetHeight - stageEl.offsetHeight),
            ),
          );

    paint(progress * (count - 1));
  }, [count, paint]);

  const go = (next: number): void => {
    const wrapEl = wrap.current;
    const stageEl = stage.current;
    if (wrapEl === null || stageEl === null || count < 2) return;

    const clamped = Math.max(0, Math.min(count - 1, next));
    const top = wrapEl.getBoundingClientRect().top + window.scrollY;
    const distance = Math.max(1, wrapEl.offsetHeight - stageEl.offsetHeight);
    const target = top + (distance * clamped) / (count - 1);
    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    window.scrollTo({ top: target, behavior: reduce ? "auto" : "smooth" });
  };

  useEffect(() => {
    const stageEl = stage.current;
    const wrapEl = wrap.current;
    if (stageEl === null || wrapEl === null) return;

    const tweenTo = (targetY: number): void => {
      const startY = window.scrollY;
      const delta = targetY - startY;
      if (Math.abs(delta) < 1) return;

      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        window.scrollTo(0, targetY);
        return;
      }

      const duration = 450;
      const started = performance.now();
      tweening.current = true;

      const step = (now: number): void => {
        const t = Math.min(1, (now - started) / duration);
        const eased =
          t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        window.scrollTo(0, startY + delta * eased);

        if (t < 1) {
          window.requestAnimationFrame(step);
        } else {
          tweening.current = false;
        }
      };

      window.requestAnimationFrame(step);
    };

    const onWheel = (event: WheelEvent): void => {
      if (tweening.current) {
        event.preventDefault();
        return;
      }

      const direction = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
      if (direction === 0) return;

      const distance = Math.max(1, wrapEl.offsetHeight - stageEl.offsetHeight);
      const top = wrapEl.getBoundingClientRect().top + window.scrollY;
      const raw = (window.scrollY - top) / distance;

      if (raw < -0.01 || raw > 1.01) return;

      const current = activeRef.current;
      const target = current + direction;
      if (target < 0 || target >= count) return;

      const now = performance.now();
      if (now - lastWheel.current > 260) wheelAccum.current = 0;
      lastWheel.current = now;
      wheelAccum.current += event.deltaY;

      if (Math.abs(wheelAccum.current) < 5) return;

      event.preventDefault();
      wheelAccum.current = 0;
      tweenTo(top + (distance * target) / (count - 1));
    };

    stageEl.addEventListener("wheel", onWheel, { passive: false });

    return () => stageEl.removeEventListener("wheel", onWheel);
  }, [count]);

  useEffect(() => {
    const wrapEl = wrap.current;
    const stageEl = stage.current;
    if (wrapEl === null || stageEl === null) return;

    let frame = 0;

    const update = (): void => {
      frame = 0;

      const distance = Math.max(1, wrapEl.offsetHeight - stageEl.offsetHeight);
      const progress = Math.min(
        1,
        Math.max(0, -wrapEl.getBoundingClientRect().top / distance),
      );

      paint(progress * (count - 1));
    };

    const schedule = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [count, paint]);

  const choose = (tone: Tone): void => {
    if (choice !== null) return;
    saveBookChoice(player, level.id, tone);
    setChoice(tone);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(active + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(active - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      go(0);
    } else if (event.key === "End") {
      event.preventDefault();
      go(count - 1);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, a")) return;
    drag.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const start = drag.current;
    drag.current = null;
    if (start === null) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 44 || Math.abs(dx) <= Math.abs(dy)) return;

    go(active + (dx < 0 ? 1 : -1));
  };

  const slide = (
    index: number,
    className: string,
    children: ReactElement,
  ): ReactElement => (
    <article
      key={index}
      className={`level-hero__slide ${className}${active === index ? " is-active" : ""}`}
      style={{
        width: "100%",
        zIndex: index,
        transform: `translate3d(${index === 0 ? 0 : 120}%, 0, 0)`,
      }}
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} / ${count} — ${label(index)}`}
      aria-hidden={active !== index}
    >
      {children}
    </article>
  );

  const choiceOption = (option: BookChoice["options"][number]): ReactElement => (
    <button
      key={option.tone}
      type="button"
      className="level-hero__choice-option"
      onClick={() => choose(option.tone)}
    >
      {option.label[language] ?? option.label["pt-BR"]}
    </button>
  );

  const chosen =
    choiceSlide === null
      ? null
      : (choiceSlide.options.find((option) => option.tone === choice) ?? null);

  return (
    <section
      className="level-hero"
      ref={wrap}
      aria-label={name}
      style={{ "--hero-steps": count - 1 } as CSSProperties}
    >
      <div
        className={`level-hero__stage${introReady ? " is-entering" : ""}`}
        ref={stage}
        role="region"
        aria-roledescription="carousel"
        aria-label={t("levelHero.book")}
        tabIndex={0}
        style={{ "--reader-size": READER_SIZES[readerSize] } as CSSProperties}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <div className="level-hero__track">
          {slide(
            0,
            "level-hero__slide--scene",
            <>
              <div className="level-hero__scene" aria-hidden="true">
                <ResponsiveImage
                  className="level-hero__art"
                  src={levelImage(level.id)}
                  alt=""
                  sizes="100vw"
                  avif={false}
                  loading="eager"
                  fetchPriority="high"
                  onLoad={() => setIntroReady(true)}
                  onError={() => setIntroReady(true)}
                />
                <Smoke />
              </div>
              <div className="level-hero__veil" aria-hidden="true" />

              <div className="envelope level-hero__inner">
                <Link
                  className="level__back"
                  to="/"
                  aria-label={t("level.back")}
                  tabIndex={active === 0 ? 0 : -1}
                >
                  ←
                </Link>

                <span className="level-hero__eyebrow">{kind}</span>
                <h1 className="level__title">{name}</h1>
                <div className="level__meta">
                  {level.difficulty === 0 && <span>{t("levels.tutorial")}</span>}
                  <Difficulty value={level.difficulty} />
                </div>
                {summary !== null && <p className="level-hero__summary">{summary}</p>}
                {recap && !previousCompleted && (
                  <p className="level-hero__summary">{t("levelHero.pending")}</p>
                )}
                <span className="level-hero__cue">{t("levelHero.scroll")}</span>
              </div>
            </>,
          )}

          {recapPages.map((previousPage, recapIndex) =>
            slide(
              1 + recapIndex,
              "level-hero__slide--recap",
                  <>
                    <ResponsiveImage
                      className="level-hero__art level-hero__art--story"
                      src={levelImage(level.id - 1)}
                      alt=""
                      sizes="100vw"
                      avif={false}
                      loading="lazy"
                    />
                    <div className="level-hero__veil level-hero__veil--book" aria-hidden="true" />

                    <div className="envelope level-hero__inner level-hero__inner--book">
                      <span className="level-hero__eyebrow">
                        {previous?.title[language] ??
                          previous?.title["pt-BR"] ??
                          t("levelHero.recap")}
                      </span>
                      <h2 className="level-hero__book-title">{t("levelHero.recap")}</h2>

                      {previousPage !== null && (
                        <div className="level-hero__reader">
                          <div className="level-hero__readbar" aria-hidden="true">
                            <i />
                          </div>
                          <div
                            className="level-hero__spread level-hero__spread--single"
                            onScroll={(event) => {
                              const node = event.currentTarget;
                              const maximum = node.scrollHeight - node.clientHeight;
                              node.parentElement?.style.setProperty(
                                "--read",
                                maximum > 0 ? String(node.scrollTop / maximum) : "1",
                              );
                            }}
                          >
                            <div className="level-hero__column">
                              {previousPage.paragraphs.map((paragraph, index) => {
                                const text = paragraph[language] ?? paragraph["pt-BR"];

                                return (
                                  <p
                                    key={`recap-${index}`}
                                    className={proseClass(text)}
                                    style={{ "--i": index } as CSSProperties}
                                  >
                                    {renderProse(text)}
                                  </p>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {recapIndex === recapPages.length - 1 && (
                        <span className="level-hero__cue">{t("levelHero.recapNext")}</span>
                      )}
                    </div>
                  </>,
            ),
          )}

          {slide(
            storyIndex,
            "level-hero__slide--story",
            <>
              <ResponsiveImage
                className="level-hero__art level-hero__art--story"
                src={levelImage(level.id)}
                alt=""
                sizes="100vw"
                avif={false}
                loading="lazy"
              />
              <div className="level-hero__veil level-hero__veil--story" aria-hidden="true" />

              <div className="envelope level-hero__inner level-hero__inner--story">
                <span className="level-hero__eyebrow">
                  {kind} — {levelCode(level.id)}
                </span>
                <h2 className="level-hero__story-title">{t("levelHero.story")}</h2>

                {summary !== null && (
                  <p className="level-hero__summary level-hero__summary--story">
                    {summary}
                  </p>
                )}

                {lead !== null && (
                  <div className="level-hero__thread">
                    <span className="level-hero__thread-label">
                      {t("home.peek.thread")}
                    </span>
                    <p>{lead[language] ?? lead["pt-BR"]}</p>
                  </div>
                )}

                <span className="level-hero__cue">
                  {book !== null ? t("levelHero.openBook") : t("levelHero.continue")}
                </span>
              </div>
            </>,
          )}

          {bookPages.map((page, pageIndex) =>
            slide(
              pagesStart + pageIndex,
              "level-hero__slide--book",
              <>
                <ResponsiveImage
                  className="level-hero__art level-hero__art--story"
                  src={levelImage(level.id)}
                  alt=""
                  sizes="100vw"
                  avif={false}
                  loading="lazy"
                />
                <div className="level-hero__veil level-hero__veil--book" aria-hidden="true" />

                <div className="envelope level-hero__inner level-hero__inner--book">
                  <span className="level-hero__eyebrow">
                    {book?.title[language] ?? book?.title["pt-BR"]}
                  </span>

                  {pageIndex === 0 && (
                    <h2 className="level-hero__book-title">
                      {book?.title[language] ?? book?.title["pt-BR"]}
                    </h2>
                  )}

                  <div className="level-hero__reader">
                    <div className="level-hero__readbar" aria-hidden="true">
                      <i />
                    </div>
                    <div
                      className="level-hero__spread"
                      onScroll={(event) => {
                        const node = event.currentTarget;
                        const maximum = node.scrollHeight - node.clientHeight;
                        node.parentElement?.style.setProperty(
                          "--read",
                          maximum > 0 ? String(node.scrollTop / maximum) : "1",
                        );
                      }}
                    >
                      {(
                        page.paragraphs.length < 4
                          ? [page.paragraphs]
                          : [
                              page.paragraphs.slice(0, Math.ceil(page.paragraphs.length / 2)),
                              page.paragraphs.slice(Math.ceil(page.paragraphs.length / 2)),
                            ]
                      ).map((column, columnIndex) => {
                        const start =
                          page.paragraphs.length < 4
                            ? 0
                            : columnIndex === 0
                              ? 0
                              : Math.ceil(page.paragraphs.length / 2);

                        return (
                          <div
                            key={columnIndex}
                            className={`level-hero__column${
                              pageIndex === 0 && columnIndex === 0
                                ? " level-hero__column--opening"
                                : ""
                            }`}
                          >
                            {column.map((paragraph, offset) => {
                              const index = start + offset;
                              const text = paragraph[language] ?? paragraph["pt-BR"];

                              return (
                                <p
                                  key={`${pageIndex}-${index}`}
                                  className={proseClass(text)}
                                  style={{ "--i": index } as CSSProperties}
                                >
                                  {renderProse(text)}
                                </p>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>,
            ),
          )}

          {choiceSlide !== null &&
            slide(
              count - 1,
              "level-hero__slide--choice",
              <>
                <ResponsiveImage
                  className="level-hero__art level-hero__art--story"
                  src={levelImage(level.id)}
                  alt=""
                  sizes="100vw"
                  avif={false}
                  loading="lazy"
                />
                <div className="level-hero__veil level-hero__veil--story" aria-hidden="true" />

                <div className="envelope level-hero__inner level-hero__inner--story">
                  <span className="level-hero__eyebrow">
                    {book?.title[language] ?? book?.title["pt-BR"]}
                  </span>
                  <h2 className="level-hero__story-title">{t("levelHero.choice")}</h2>

                  <p className="level-hero__summary level-hero__summary--story">
                    {choiceSlide.prompt[language] ?? choiceSlide.prompt["pt-BR"]}
                  </p>

                  {chosen === null ? (
                    <div className="level-hero__choice-options">
                      {choiceSlide.options.map(choiceOption)}
                    </div>
                  ) : (
                    <div className="level-hero__choice-result">
                      <p className="level-hero__choice-label">
                        {chosen.label[language] ?? chosen.label["pt-BR"]}
                      </p>
                      <p className="level-hero__choice-response">
                        {chosen.response[language] ?? chosen.response["pt-BR"]}
                      </p>
                    </div>
                  )}

                  <span className="level-hero__cue">{t("levelHero.continue")}</span>
                </div>
              </>,
            )}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              className="level-hero__arrow level-hero__arrow--prev"
              onClick={() => go(active - 1)}
              disabled={active === 0}
              aria-label={t("levelHero.prev")}
            >
              ‹
            </button>
            <button
              type="button"
              className="level-hero__arrow level-hero__arrow--next"
              onClick={() => go(active + 1)}
              disabled={active === count - 1}
              aria-label={t("levelHero.next")}
            >
              ›
            </button>

            <div className="level-hero__dots">
              <span className="level-hero__ticks">
                {Array.from({ length: count }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`level-hero__dot${index === active ? " is-active" : ""}`}
                    onClick={() => go(index)}
                    aria-label={`${index + 1} / ${count} — ${label(index)}`}
                    aria-current={index === active ? "true" : undefined}
                  />
                ))}
              </span>
              <span className="level-hero__count">
                {String(active + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
              </span>
              <button
                type="button"
                className="level-hero__size"
                onClick={cycleReader}
                aria-label={`Aa — ${t("levelHero.textSize")}`}
              >
                Aa
              </button>
            </div>
          </>
        )}

        <p className="visually-hidden" aria-live="polite">
          {label(active)}
        </p>
      </div>
    </section>
  );
}
