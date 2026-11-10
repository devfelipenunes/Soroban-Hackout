import { useEffect, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";

import { useSeasonProgress } from "../game/season.ts";
import { useLanguage } from "../i18n/language.tsx";
import type { Language } from "../i18n/translate.ts";
import {
  FINAL_AFTER,
  FINAL_SCENES,
  FINAL_SPEAKER,
  type FinalScene,
  type FinalText,
} from "../levels/epilogue.ts";
import { LEVELS, levelImage } from "../levels/index.ts";
import { useWallet } from "../wallet/context.tsx";

type Status = "cached" | "checking" | "no-wallet" | "locked" | "ready" | "error";

type Stage = "scenes" | "after";


const pick = (text: FinalText, language: Language): string =>
  text[language] ?? text["pt-BR"];

const fill = (text: string, player: string | null): string =>
  text.replaceAll("{player}", player ?? "NO PLAYER");

export function Final(): ReactElement {
  const { t, language } = useLanguage();
  const wallet = useWallet();
  const progress = useSeasonProgress();

  const [stage, setStage] = useState<Stage>("scenes");
  const [step, setStep] = useState(0);
  const [afterStep, setAfterStep] = useState(0);

  const address = wallet.address;
  const solved = progress.solved;
  const pending = progress.pending;
  const reason = progress.reason;
  const status: Status =
    progress.status === "ready"
      ? solved === LEVELS.length
        ? "ready"
        : "locked"
      : progress.status;

  useEffect(() => {
    document.title = "The Architect — BREAKER";
  }, []);

  const text = (value: FinalText): string => fill(pick(value, language), address);

  const restart = (): void => {
    setStage("scenes");
    setStep(0);
    setAfterStep(0);
  };

  const renderScene = (scene: FinalScene): ReactElement => (
    <article className="final__scene" key={scene.id}>
      <span className="final__code">{scene.code}</span>
      <h2 className="final__scene-title">{text(scene.title)}</h2>

      <div className="final__lines">
        {scene.lines.map((line, index) => (
          <div
            className={`final__line final__line--${line.speaker}`}
            key={`${scene.id}-${index}`}
          >
            <span className="final__speaker">{FINAL_SPEAKER[line.speaker]}</span>
            <p>{text(line.text)}</p>
          </div>
        ))}
      </div>

      {scene.terminal !== undefined && (
        <pre className="final__terminal">{scene.terminal.join("\n")}</pre>
      )}

      {scene.gallery !== undefined && (
        <div className="final__gallery">
          {scene.gallery.map((id) => (
            <img key={id} src={levelImage(id)} alt="" loading="lazy" decoding="async" />
          ))}
        </div>
      )}
    </article>
  );

  const scene = FINAL_SCENES[step];
  const after = FINAL_AFTER[afterStep];

  return (
    <main id="main-content" className="content">
      <section className="final">
        <div className="final__inner">
          <span className="final__eyebrow">{t("final.eyebrow")}</span>
          <h1 className="final__title">{t("final.title")}</h1>
          <p className="final__subtitle">{t("final.subtitle")}</p>

          {(status === "checking" || status === "cached") && (
            <p className="final__note">{t("final.checking")}</p>
          )}

          {status === "no-wallet" && (
            <div className="final__locked">
              <h2>{t("final.noWallet")}</h2>
              <p>{t("final.noWalletHint")}</p>
              <Link className="button" to="/help">
                {t("final.howToPlay")}
              </Link>
            </div>
          )}

          {status === "locked" && (
            <div className="final__locked">
              <h2>{t("final.locked")}</h2>
              <p>{t("final.progress", { solved, total: LEVELS.length })}</p>
              {pending !== null && (
                <Link className="button" to={`/level/${pending}`}>
                  {t("final.openCase")}
                </Link>
              )}
            </div>
          )}

          {status === "error" && (
            <p className="final__note">{t("final.error", { reason })}</p>
          )}

          {status === "ready" && stage === "scenes" && scene !== undefined && (
            <>
              {renderScene(scene)}

              <div className="final__actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    if (step < FINAL_SCENES.length - 1) setStep(step + 1);
                    else setStage("after");
                  }}
                >
                  {step < FINAL_SCENES.length - 1
                    ? t("final.continue")
                    : t("final.choiceNow")}
                </button>
              </div>
            </>
          )}

          {status === "ready" && stage === "after" && after !== undefined && (
            <>
              {renderScene(after)}

              <div className="final__actions">
                {afterStep < FINAL_AFTER.length - 1 ? (
                  <button
                    type="button"
                    className="button"
                    onClick={() => setAfterStep(afterStep + 1)}
                  >
                    {t("final.continue")}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={restart}
                    >
                      {t("final.restart")}
                    </button>
                    <Link className="button" to="/">
                      {t("final.home")}
                    </Link>
                  </>
                )}
              </div>
            </>
          )}

          {status !== "ready" && (
            <p className="final__note">{t("final.readNote")}</p>
          )}
        </div>
      </section>
    </main>
  );
}
