import type { CallEvent } from "../chain/events.ts";
import { isTone, type Tone } from "../levels/narrative.ts";

export type HintSource = "casefile" | "stuck";

export type HintEvent = {
  readonly index: number;
  readonly at: number;
  readonly source: HintSource;
};

export type CaseRecord = {
  readonly fired: readonly number[];
  readonly revealed: readonly string[];
  readonly calls: readonly CallEvent[];
  readonly hintLevel: number;
  readonly hints: readonly HintEvent[];
  readonly assisted: boolean;
  readonly choices: Readonly<Record<string, Tone>>;
};

export const emptyCase = (): CaseRecord => ({
  fired: [],
  revealed: [],
  calls: [],
  hintLevel: 0,
  hints: [],
  assisted: false,
  choices: {},
});

export const EMPTY_CASE: CaseRecord = emptyCase();

const keyOf = (player: string | undefined, levelId: number): string =>
  `breaker.case.v3.${player ?? "anon"}.${levelId}`;

const isCalls = (value: unknown): value is CallEvent[] =>
  Array.isArray(value) &&
  value.every(
    (call) =>
      typeof call === "object" &&
      call !== null &&
      (call as { type?: unknown }).type === "call" &&
      Number.isInteger((call as { id?: unknown }).id) &&
      typeof (call as { method?: unknown }).method === "string",
  );

const isHints = (value: unknown): value is HintEvent[] =>
  Array.isArray(value) &&
  value.every(
    (hint) =>
      typeof hint === "object" &&
      hint !== null &&
      Number.isInteger((hint as { index?: unknown }).index) &&
      typeof (hint as { at?: unknown }).at === "number" &&
      ((hint as { source?: unknown }).source === "casefile" ||
        (hint as { source?: unknown }).source === "stuck"),
  );

export function loadCase(player: string | undefined, levelId: number): CaseRecord {
  try {
    const raw = window.localStorage.getItem(keyOf(player, levelId));
    if (raw === null) return emptyCase();

    const parsed = JSON.parse(raw) as Partial<CaseRecord> & { choices?: unknown };

    const fired = Array.isArray(parsed.fired)
      ? parsed.fired.filter((index): index is number => Number.isInteger(index))
      : [];
    const revealed = Array.isArray(parsed.revealed)
      ? parsed.revealed.filter((id): id is string => typeof id === "string")
      : [];
    const calls = isCalls(parsed.calls) ? parsed.calls.slice(-50) : [];
    const hintLevel =
      typeof parsed.hintLevel === "number"
        ? Math.max(0, Math.min(3, Math.trunc(parsed.hintLevel)))
        : 0;
    const hints = isHints(parsed.hints) ? parsed.hints.slice(-3) : [];
    const assisted = parsed.assisted === true || hintLevel >= 3;
    const choices =
      typeof parsed.choices === "object" &&
      parsed.choices !== null &&
      !Array.isArray(parsed.choices)
        ? (Object.fromEntries(
            Object.entries(parsed.choices).filter(([, tone]) => isTone(tone)),
          ) as Record<string, Tone>)
        : {};

    return { fired, revealed, calls, hintLevel, hints, assisted, choices };
  } catch {
    return emptyCase();
  }
}

export function saveCase(
  player: string | undefined,
  levelId: number,
  record: CaseRecord,
): void {
  try {
    window.localStorage.setItem(keyOf(player, levelId), JSON.stringify(record));
  } catch {
    void 0;
  }
}

export function clearCase(player: string | undefined, levelId: number): void {
  try {
    window.localStorage.removeItem(keyOf(player, levelId));
  } catch {
    void 0;
  }
}
