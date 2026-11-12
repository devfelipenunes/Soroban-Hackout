import { useEffect, useState, type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";

import { useSeasonProgress } from "../game/season.ts";
import { useLanguage } from "../i18n/language.tsx";
import type { Language } from "../i18n/translate.ts";
import {
  choose,
  levelById,
  levelCode,
  loadStory,
  type Level,
} from "../levels/index.ts";
import type { CaseStory as CaseStoryData, StoryScene } from "../levels/story.ts";
import type { LocalizedText } from "../levels/text.ts";
import { NotFound } from "./NotFound.tsx";

const pick = (text: LocalizedText, language: Language): string =>
  text[language] ?? text["pt-BR"];

export function CaseStory(): ReactElement {
  const { levelId } = useParams();
  const id = Number(levelId);
  const level = Number.isInteger(id) ? levelById(id) : undefined;

  if (!level) return <NotFound />;

  return <Page key={level.id} level={level} />;
}

function Page({ level }: { level: Level }): ReactElement {
  const { t, language } = useLanguage();
  const progress = useSeasonProgress();

  const [story, setStory] = useState<CaseStoryData | null>(null);
  const [step, setStep] = useState(0);

  const solved = progress.completed[level.id] === true;
  const name = choose(level.name, language)?.text ?? `Level ${level.id}`;

  useEffect(() => {
    document.title = `${name} — ${t("story.eyebrow")} — BREAKER`;
  }, [name, t]);

  useEffect(() => {
    let alive = true;

    void loadStory(level.id).then((loaded) => {
      if (alive) setStory(loaded);
    });

    return () => {
      alive = false;
    };
  }, [level.id]);

  const scenes = story?.scenes ?? [];
  const scene: StoryScene | undefined = scenes[step];

  return (
    <main id="main-content" className="content">
      <section className="story">
        <div className="story__inner">
          <span className="story__eyebrow">
            CASE {levelCode(level.id)} · {t("story.eyebrow")}
          </span>
          <h1 className="story__title">{name}</h1>

          {(progress.status === "checking" || progress.status === "cached") && (
            <p className="story__note">{t("story.loading")}</p>
          )}

          {progress.status === "no-wallet" && (
            <div className="story__locked">
              <h2>{t("story.locked")}</h2>
              <p>{t("story.lockedBody")}</p>
              <Link className="season-button" to={`/level/${level.id}`}>
                {t("story.back")}
              </Link>
            </div>
          )}

          {progress.status === "error" && (
            <p className="story__note">
              {t("story.error", { reason: progress.reason })}
            </p>
          )}

          {progress.status === "ready" && !solved && (
            <div className="story__locked">
              <h2>{t("story.locked")}</h2>
              <p>{t("story.lockedBody")}</p>
              <Link className="season-button" to={`/level/${level.id}`}>
                {t("story.back")}
              </Link>
            </div>
          )}

          {progress.status === "ready" && solved && story === null && (
            <p className="story__note">{t("story.missing")}</p>
          )}

          {progress.status === "ready" && solved && scene !== undefined && (
            <>
              <article className="story__scene">
                <span className="story__code">
                  {t("story.progress", {
                    current: step + 1,
                    total: scenes.length,
                  })}
                </span>
                <h2 className="story__scene-title">{pick(scene.title, language)}</h2>

                <div className="story__body">
                  {scene.paragraphs.map((paragraph, index) => (
                    <p key={`${scene.id}-${index}`}>{pick(paragraph, language)}</p>
                  ))}
                </div>
              </article>

              <div className="story__actions">
                {step > 0 && (
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => setStep(step - 1)}
                  >
                    {t("story.previous")}
                  </button>
                )}

                {step < scenes.length - 1 ? (
                  <button
                    type="button"
                    className="button"
                    onClick={() => setStep(step + 1)}
                  >
                    {t("story.continue")}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => setStep(0)}
                    >
                      {t("story.restart")}
                    </button>
                    <Link className="button" to={`/level/${level.id}`}>
                      {t("story.back")}
                    </Link>
                  </>
                )}
              </div>
            </>
          )}

          <p className="story__note">{t("story.readNote")}</p>
        </div>
      </section>
    </main>
  );
}
