import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CaseRecord } from "./caseStore.ts";
import { clearCase, emptyCase, loadCase, saveCase } from "./caseStore.ts";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string): string | null => store.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        store.set(key, value);
      },
      removeItem: (key: string): void => {
        store.delete(key);
      },
    },
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const PLAYER = "GPLAYER";
const record: CaseRecord = {
  fired: [0, 2],
  revealed: ["beta-proof"],
  calls: [{ type: "call", id: 1, method: "alpha", kind: "read", outcome: "accepted", at: 1 }],
  hintLevel: 2,
  hints: [
    { index: 0, at: 1, source: "casefile" },
    { index: 1, at: 2, source: "stuck" },
  ],
  assisted: false,
  choices: { "tone-alpha": "doubt" },
};

describe("the case store", () => {
  it("writes under the player and level key, not a shared key", () => {
    saveCase(PLAYER, 5, record);

    expect([...store.keys()]).toEqual([`breaker.case.v3.${PLAYER}.5`]);
  });

  it("does not reuse indices from the previous narrative version", () => {
    store.set(`breaker.case.${PLAYER}.5`, JSON.stringify(record));
    expect(loadCase(PLAYER, 5)).toEqual(emptyCase());
  });

  it("round-trips every field, including the hint trail and choices", () => {
    saveCase(PLAYER, 5, record);

    expect(loadCase(PLAYER, 5)).toEqual(record);
  });

  it("keeps records isolated per player and per level", () => {
    saveCase(PLAYER, 5, record);

    expect(loadCase("GOTHER", 5)).toEqual(emptyCase());
    expect(loadCase(PLAYER, 6)).toEqual(emptyCase());
  });

  it("reads a legacy record without choices as an empty choice map", () => {
    const legacy: Record<string, unknown> = { ...record };
    delete legacy.choices;
    store.set(`breaker.case.v3.${PLAYER}.5`, JSON.stringify(legacy));

    const loaded = loadCase(PLAYER, 5);

    expect(loaded.choices).toEqual({});
    expect(loaded.fired).toEqual([0, 2]);
    expect(loaded.hintLevel).toBe(2);
    expect(loaded.hints).toEqual(record.hints);
  });

  it("marks a record assisted once the third hint was reached", () => {
    store.set(
      `breaker.case.v3.${PLAYER}.5`,
      JSON.stringify({ ...record, hintLevel: 3, hints: [], assisted: false }),
    );

    expect(loadCase(PLAYER, 5).assisted).toBe(true);
  });

  it("drops tones that are not valid, keeping the valid ones", () => {
    store.set(
      `breaker.case.v3.${PLAYER}.5`,
      JSON.stringify({ ...record, choices: { good: "silence", bad: "certain" } }),
    );

    expect(loadCase(PLAYER, 5).choices).toEqual({ good: "silence" });
  });

  it("falls back to an empty case on corrupt storage", () => {
    store.set(`breaker.case.v3.${PLAYER}.5`, "{not json");

    expect(loadCase(PLAYER, 5)).toEqual(emptyCase());
  });

  it("clears only the current player and level", () => {
    saveCase(PLAYER, 5, record);
    saveCase(PLAYER, 6, record);

    clearCase(PLAYER, 5);

    expect(store.has(`breaker.case.v3.${PLAYER}.5`)).toBe(false);
    expect(store.has(`breaker.case.v3.${PLAYER}.6`)).toBe(true);
  });
});
