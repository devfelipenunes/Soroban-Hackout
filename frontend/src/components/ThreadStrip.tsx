import type { ReactElement } from "react";

import { useLanguage } from "../i18n/language.tsx";
import type { CaseFile } from "../levels/casefile.ts";
import type { LocalizedText } from "../levels/text.ts";

export function ThreadStrip({
  caseFile,
  player,
  instance,
}: {
  caseFile: CaseFile | null;
  player: string | undefined;
  instance: string | undefined;
}): ReactElement | null {
  const { t, language } = useLanguage();

  if (caseFile === null || caseFile.lead === undefined) return null;

  const pick = (text: LocalizedText): string => text[language] ?? text["pt-BR"];

  const fill = (text: string): string =>
    text
      .replaceAll("{player}", player ?? "NO PLAYER")
      .replaceAll("{instance}", instance ?? "NO INSTANCE");

  return (
    <section className="box thread" aria-labelledby="thread-title">
      <h2 className="box__title" id="thread-title">
        {t("thread.title")}
      </h2>
      <p className="thread__lead">{fill(pick(caseFile.lead))}</p>
      <ul className="thread__facts">
        {caseFile.known.slice(0, 2).map((fact, index) => (
          <li key={`thread-${index}`}>{fill(pick(fact))}</li>
        ))}
      </ul>
    </section>
  );
}
