import { isTone, type Tone } from "../levels/narrative.ts";

const keyOf = (player: string | undefined, levelId: number): string =>
  `breaker.book.${player ?? "anon"}.${levelId}`;

export function loadBookChoice(
  player: string | undefined,
  levelId: number,
): Tone | null {
  try {
    const raw = window.localStorage.getItem(keyOf(player, levelId));
    return isTone(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveBookChoice(
  player: string | undefined,
  levelId: number,
  tone: Tone,
): void {
  try {
    window.localStorage.setItem(keyOf(player, levelId), tone);
  } catch {
    void 0;
  }
}
