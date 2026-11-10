import { useEffect, useRef, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";

import { Mosaic } from "../components/Mosaic.tsx";
import { Clouds } from "../components/Clouds.tsx";
import { SeasonClaim } from "../components/SeasonClaim.tsx";
import { Smoke } from "../components/Smoke.tsx";
import { useLanguage } from "../i18n/language.tsx";
import { useProgress } from "../game/progress.tsx";
import { useSeasonProgress } from "../game/season.ts";
import { HOMEPAGE_IMAGE, LEVELS, levelImage } from "../levels/index.ts";

const SECTORS = ["upper", "central", "lower", "spire"] as const;

export function Home(): ReactElement {
  const { t } = useLanguage();
  const { solvedIds: sessionSolved } = useProgress();
  const season = useSeasonProgress();
  const chainSolved = new Set(
    LEVELS.filter((_, index) => season.completed[index]).map((level) => level.id),
  );
  const solvedIds = new Set<number>([...sessionSolved, ...chainSolved]);
  const confirmedSolvedIds = new Set<number>([
    ...sessionSolved,
    ...(season.status === "ready" ? chainSolved : []),
  ]);
  const lockedIds = new Set(
    season.status === "error"
      ? LEVELS.map((level) => level.id)
      : season.status === "ready"
        ? LEVELS.filter((_, index) => !season.accessible[index]).map((level) => level.id)
        : [],
  );
  const allSolved = confirmedSolvedIds.size === LEVELS.length;
  const readyForArchitect = confirmedSolvedIds.has(11) && !confirmedSolvedIds.has(12);
  const [sector, setSector] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const cityTimer = useRef<number | null>(null);
  const keepCity = (): void => {
    if (cityTimer.current !== null) window.clearTimeout(cityTimer.current);
  };
  const leaveCity = (): void => {
    keepCity();
    if (!pinned) cityTimer.current = window.setTimeout(() => setSector((current) => current === "meridian" ? null : current), 250);
  };
  useEffect(() => () => { if (cityTimer.current !== null) window.clearTimeout(cityTimer.current); }, []);

  const closeSector = (): void => {
    setSector(null);
    setPinned(false);
  };

  const leaveSector = (): void => {
    if (!pinned) setSector(null);
  };

  const toggleSector = (key: string): void => {
    if (pinned && sector === key) {
      closeSector();
      return;
    }

    setPinned(true);
    setSector(key);
  };

  useEffect(() => {
    document.title = "BREAKER";
  }, []);

  useEffect(() => {
    if (sector === null) return;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeSector();
    };

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);
  }, [sector]);

  return (
    <main id="main-content" className="content">
      <div className="season-home">
        <section className={`season-hero${sector === null ? "" : " is-focus"}`}>
          <img className="season-hero__art" src={HOMEPAGE_IMAGE} alt="" width={2048} height={768} />
          <img
            className="season-hero__depth"
            src={HOMEPAGE_IMAGE}
            width={2048}
            height={768}
            alt=""
            aria-hidden="true"
          />
          <Clouds />
          <div className="season-hero__beams" aria-hidden="true">
            <i />
            <i />
          </div>
          <div className="season-hero__traffic" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <Smoke />
          <div className="season-hero__veil" aria-hidden="true" />

          <div className="season-hero__inner">
            <div className="season-hero__copy">
              <span className="season-hero__brand">BREAKER</span>
              <span className="season-hero__eyebrow">{t("home.eyebrow")}</span>
              <h1 className="season-hero__title">{t("home.title")}</h1>
              <p className="season-hero__tagline">{t("home.tagline")}</p>
              <p className="season-hero__subtitle">{t("home.subtitle")}</p>

            </div>

            <button type="button" className="season-city" aria-expanded={sector === "meridian"} aria-controls="season-dossier"
              onMouseEnter={() => { keepCity(); setSector("meridian"); }} onMouseLeave={leaveCity}
              onFocus={() => { keepCity(); setSector("meridian"); }} onBlur={leaveCity}
              onClick={() => { keepCity(); toggleSector("meridian"); }}>
              <span className="season-city__wordmark">Meridian</span>
            </button>
          </div>

          <div className="season-map">
            {SECTORS.map((key) => (
              <button
                type="button"
                className={`season-sector season-sector--${key}${
                  sector === key ? " is-active" : ""
                }`}
                key={key}
                onMouseOver={() => setSector(key)}
                onMouseOut={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    leaveSector();
                  }
                }}
                onFocus={() => setSector(key)}
                onBlur={leaveSector}
                onClick={() => toggleSector(key)}
                aria-expanded={sector === key}
                aria-pressed={pinned && sector === key}
                aria-label={`${t(`home.sector.${key}`)}: ${t(`home.sector.${key}.sub`)}`}
                aria-controls="season-dossier"
              >
                <span className="season-sector__name">{t(`home.sector.${key}`)}</span>
                <span className="season-sector__sub">{t(`home.sector.${key}.sub`)}</span>
                <span className="season-sector__tick" aria-hidden="true" />
              </button>
            ))}
          </div>

          {sector !== null && (
            <>
              <button
                type="button"
                className="season-hero__focus"
                onClick={closeSector}
                aria-label={t("home.sector.close")}
              />

              <aside
                className={`season-dossier${sector === "meridian" ? " season-dossier--city" : ""}${
                  sector === "central" || sector === "lower"
                    ? " season-dossier--right"
                    : " season-dossier--left"
                }`}
                id="season-dossier"
                onMouseEnter={() => { if (sector === "meridian") keepCity(); }}
                onMouseLeave={() => { if (sector === "meridian") leaveCity(); }}
                aria-label={`${t("home.sector.dossier")}: ${t(`home.sector.${sector}`)}`}
              >
                {sector !== "meridian" && <span className="season-dossier__eyebrow">{t("home.sector.dossier")}</span>}
                <h3 className="season-dossier__title">{t(`home.sector.${sector}`)}</h3>
                {sector !== "meridian" && <span className="season-dossier__sub">{t(`home.sector.${sector}.sub`)}</span>}
                <p className="season-dossier__body">{t(`home.sector.${sector}.body`)}</p>
                {sector === "meridian" && <p className="season-dossier__body">{t("home.sector.meridian.life")}</p>}
              </aside>
            </>
          )}
        </section>

        <section className="season-cases" id="casos">
          <h2 className="visually-hidden">{t("home.cases")}</h2>
          {season.status === "checking" && (
            <p className="season-progress">{t("home.progressChecking")}</p>
          )}
          {season.status === "cached" && season.solved > 0 && (
            <p className="season-progress" aria-live="polite">
              {t("home.progressCached", { solved: season.solved, total: LEVELS.length })}
            </p>
          )}
          {season.status === "ready" && season.solved > 0 && (
            <p className="season-progress">
              {t("home.progress", { solved: season.solved, total: LEVELS.length })}
            </p>
          )}
          {season.status === "error" && (
            <p className="season-progress">
              {t("home.progressError")}{" "}
              <button type="button" className="button button--secondary" onClick={season.reload}>
                {t("home.retry")}
              </button>
            </p>
          )}
          <Mosaic
            levels={LEVELS.slice(0, -1)}
            solvedIds={solvedIds}
            lockedIds={lockedIds}
          />
        </section>

        <section className="season-next">
          <h2 className="visually-hidden">{t("home.final.title")}</h2>
          <article className="next-card next-card--final">
            <img
              className="next-card__art"
              src={levelImage(12)}
              width={1600}
              height={600}
              alt=""
              loading="lazy"
              decoding="async"
            />
            <div className="next-card__veil" aria-hidden="true" />
            <div className="next-card__body">
              <div className="next-card__final-heading">
                <span className="next-card__tag">{t("home.final.eyebrow")}</span>
              </div>
              <h3>{t("home.final.title")}</h3>
              {allSolved ? (
                <>
                  <blockquote>{t("home.final.quote")}</blockquote>
                  <p>{t("home.final.body")}</p>
                </>
              ) : (
                <>
                  <p className="next-card__teaser">{t("home.final.teaser")}</p>
                  <p>{t("home.final.teaserBody")}</p>
                </>
              )}
              <span className="next-card__locked">
                {allSolved
                  ? t("home.final.ready")
                  : readyForArchitect
                    ? t("home.final.caseReady")
                    : t("home.final.locked")}
              </span>
              <div className="next-card__actions">
                <Link
                  className="button"
                  to={readyForArchitect ? "/level/12" : "/final"}
                >
                  {readyForArchitect
                    ? t("home.final.openCase")
                    : t("home.final.open")}
                </Link>
                <SeasonClaim completed={allSolved} />
              </div>
            </div>
          </article>
        </section>

        <section className="season-next season-next--upcoming" aria-label={t("home.seasons.upcoming")}>
          <div className="season-boundary" aria-hidden="true">
            <span>{t("home.eyebrow")}</span>
            <span className="season-boundary__line" />
            <span>{t("home.seasons.upcoming")}</span>
          </div>
          <div className="season-reveal">
            <article className="season-hero season-hero--upcoming">
              <img className="season-hero__art" src="/images/seasons/lumen.webp" alt="" loading="lazy" decoding="async" width={2048} height={683} />
              <Clouds />
              <Smoke />
              <div className="season-hero__veil" aria-hidden="true" />
              <span className="season-hero__coming-soon">{t("home.season2.soon")}</span>
              <div className="season-hero__inner">
                <div className="season-hero__copy">
                  <span className="season-hero__eyebrow">{t("home.season2.eyebrow")}</span>
                  <h2 className="season-hero__title" id="season-two-title">Lumen</h2>
                  <p className="season-hero__subtitle">{t("home.season2.body")}</p>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="season-next season-next--upcoming" aria-label={t("home.season3.eyebrow")}>
          <div className="season-reveal">
            <article className="season-hero season-hero--upcoming">
              <img className="season-hero__art" src="/images/seasons/veil.webp" alt="" loading="lazy" decoding="async" width={2172} height={724} />
              <Clouds />
              <Smoke />
              <div className="season-hero__veil" aria-hidden="true" />
              <span className="season-hero__coming-soon">{t("home.season2.soon")}</span>
              <div className="season-hero__inner">
                <div className="season-hero__copy">
                  <span className="season-hero__eyebrow">{t("home.season3.eyebrow")}</span>
                  <h2 className="season-hero__title">The Veil</h2>
                  <p className="season-hero__subtitle">{t("home.season3.body")}</p>
                </div>
              </div>
            </article>
          </div>
        </section>

        <footer className="season-credit">
          <span className="season-credit__label">{t("home.developedBy")}</span>
          <img
            className="season-credit__zolvency"
            src="/images/brand/zolvency.webp"
            alt="Zolvency"
            loading="lazy"
            decoding="async"
            width={1707}
            height={210}
          />
          <span className="season-credit__divider" aria-hidden="true" />
          <img
            className="season-credit__stellar"
            src="/images/brand/stellar-white.webp"
            alt="Stellar"
            loading="lazy"
            decoding="async"
            width={800}
            height={200}
          />
        </footer>
      </div>
    </main>
  );
}
