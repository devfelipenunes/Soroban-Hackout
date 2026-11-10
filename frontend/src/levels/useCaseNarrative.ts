import { useCallback, useEffect, useState } from "react";

import { subscribe, type CallEvent } from "../chain/events.ts";
import { clearCase, emptyCase, loadCase, saveCase, type CaseRecord, type HintEvent, type HintSource } from "../game/caseStore.ts";
import { isTone, type Narrative, type Tone } from "./narrative.ts";

export type CaseNarrative = {
  readonly fired: readonly number[];
  readonly revealed: ReadonlySet<string>;
  readonly calls: CaseRecord["calls"];
  readonly hintLevel: number;
  readonly hints: readonly HintEvent[];
  readonly assisted: boolean;
  readonly choices: Readonly<Record<string, Tone>>;
  readonly requestHint: () => void;
  readonly chooseTone: (choiceId: string, tone: Tone) => void;
  readonly clear: () => void;
};

export function upsertCall(
  calls: readonly CallEvent[],
  event: CallEvent,
): CallEvent[] {
  const index = calls.findIndex((call) => call.id === event.id);

  if (index === -1) return [...calls, event].slice(-50);

  return calls
    .map((call, position) => (position === index ? event : call))
    .slice(-50);
}

export function triggerFired(
  record: CaseRecord,
  narrative: Narrative,
  trigger: string,
): boolean {
  return narrative.beats.some(
    (beat, index) => beat.trigger === trigger && record.fired.includes(index),
  );
}

export function applyToneChoice(
  record: CaseRecord,
  narrative: Narrative,
  choiceId: string,
  tone: Tone,
): CaseRecord {
  const choice = narrative.choices?.find((item) => item.id === choiceId);
  if (choice === undefined || !isTone(tone)) return record;
  if (!triggerFired(record, narrative, choice.trigger)) return record;
  if (Object.hasOwn(record.choices, choiceId)) return record;

  return {
    ...record,
    choices: { ...record.choices, [choiceId]: tone },
  };
}

export function addHint(record: CaseRecord, source: HintSource): CaseRecord {
  if (record.hintLevel >= 3) return record;

  const index = record.hintLevel;
  if (record.hints.some((hint) => hint.index === index)) return record;

  const hints = [...record.hints, { index, at: Date.now(), source }];
  const hintLevel = Math.min(3, record.hintLevel + 1);

  return { ...record, hints, hintLevel, assisted: hintLevel >= 3 };
}

export function revealBeats(  record: CaseRecord,
  narrative: Narrative,
  trigger: string,
): CaseRecord {
  const fired = [...record.fired];
  narrative.beats.forEach((beat, index) => {
    if (beat.trigger === trigger && !fired.includes(index)) fired.push(index);
  });

  const revealed = new Set(record.revealed);
  for (const item of narrative.evidence) {
    if (item.reveal === trigger) revealed.add(item.id);
  }
  for (const item of narrative.documents ?? []) {
    if (item.reveal === trigger) revealed.add(item.id);
  }

  if (fired.length === record.fired.length && revealed.size === record.revealed.length) {
    return record;
  }

  return {
    ...record,
    fired,
    revealed: [...revealed],
  };
}

export function useCaseNarrative(
  narrative: Narrative | null,
  player: string | undefined,
  levelId: number,
  solved: boolean,
  previousCompleted = false,
  instanceReady = false,
): CaseNarrative {
  const currentKey = `${player ?? "anon"}:${levelId}`;
  const [record, setRecord] = useState<CaseRecord>(() => loadCase(player, levelId));
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    setRecord(loadCase(player, levelId));
    setLoadedKey(currentKey);
  }, [currentKey, player, levelId]);

  useEffect(() => {
    if (loadedKey === currentKey) saveCase(player, levelId, record);
  }, [loadedKey, currentKey, player, levelId, record]);

  useEffect(() => {
    if (narrative === null) return;
    setRecord((previous) => revealBeats(previous, narrative, "start"));
  }, [narrative]);

  useEffect(() => {
    if (!solved || narrative === null) return;
    setRecord((previous) => revealBeats(previous, narrative, "solved"));
  }, [solved, narrative]);

  useEffect(() => {
    if (!previousCompleted || narrative === null) return;
    setRecord((previous) => revealBeats(previous, narrative, "previous-solved"));
  }, [previousCompleted, narrative]);

  useEffect(() => {
    if (!instanceReady || narrative === null) return;
    setRecord((previous) => revealBeats(previous, narrative, "instance"));
  }, [instanceReady, narrative]);

  useEffect(() => {
    if (narrative === null) return;

    return subscribe((event) => {
      if (event.type === "call") {
        setRecord((previous) => {
          let next: CaseRecord = {
            ...previous,
            calls: upsertCall(previous.calls, event),
          };

          if (previous.calls.length === 0) {
            next = revealBeats(next, narrative, "first-call");
          }

          if (event.outcome === "accepted") {
            next = revealBeats(next, narrative, `call:${event.method}`);
          }

          return next;
        });
        return;
      }

      if (event.type === "stuck") {
        setRecord((previous) => {
          const next = revealBeats(previous, narrative, "stuck");
          return next.hintLevel >= 1 ? next : addHint(next, "stuck");
        });
        return;
      }

      setRecord((previous) => revealBeats(previous, narrative, event.type));
    });
  }, [narrative]);

  const requestHint = useCallback(() => {
    setRecord((previous) => addHint(previous, "casefile"));
  }, []);

  const chooseTone = useCallback(
    (choiceId: string, tone: Tone) => {
      setRecord((previous) =>
        narrative === null
          ? previous
          : applyToneChoice(previous, narrative, choiceId, tone),
      );
    },
    [narrative],
  );

  const clear = useCallback(() => {
    clearCase(player, levelId);
    setRecord(emptyCase());
  }, [player, levelId]);

  const visible = loadedKey === currentKey && narrative !== null
    ? visibleNarrativeRecord(record, narrative, solved, previousCompleted)
    : emptyCase();
  return {
    fired: visible.fired,
    revealed: new Set(visible.revealed),
    calls: visible.calls,
    hintLevel: record.hintLevel,
    hints: record.hints,
    assisted: record.assisted,
    choices: record.choices,
    requestHint,
    chooseTone,
    clear,
  };
}


export function visibleNarrativeRecord(record: CaseRecord, narrative: Narrative, solved: boolean, previousCompleted: boolean): CaseRecord {
  const allowed = (trigger: string): boolean => trigger === "solved" ? solved : trigger === "previous-solved" ? previousCompleted : true;
  const items = [...narrative.evidence, ...(narrative.documents ?? [])];
  return {
    ...record,
    fired: record.fired.filter((index) => {
      const beat = narrative.beats[index];
      return beat !== undefined && allowed(beat.trigger);
    }),
    revealed: record.revealed.filter((id) => items.some((item) => item.id === id && allowed(item.reveal))),
  };
}
