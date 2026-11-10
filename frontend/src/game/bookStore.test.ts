import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadBookChoice, saveBookChoice } from "./bookStore.ts";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string): string | null => store.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        store.set(key, value);
      },
    },
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("the book choice store", () => {
  it("writes under the player and level key", () => {
    saveBookChoice("GPLAYER", 4, "doubt");

    expect([...store.keys()]).toEqual(["breaker.book.GPLAYER.4"]);
    expect(store.get("breaker.book.GPLAYER.4")).toBe("doubt");
  });

  it("round-trips a valid tone", () => {
    saveBookChoice("GPLAYER", 4, "silence");

    expect(loadBookChoice("GPLAYER", 4)).toBe("silence");
  });

  it("isolates players and levels", () => {
    saveBookChoice("GPLAYER", 4, "confidence");

    expect(loadBookChoice("GOTHER", 4)).toBeNull();
    expect(loadBookChoice("GPLAYER", 5)).toBeNull();
  });

  it("rejects a value that is not a tone", () => {
    store.set("breaker.book.GPLAYER.4", "certain");

    expect(loadBookChoice("GPLAYER", 4)).toBeNull();
  });

  it("returns null when storage fails", () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error("storage disabled");
        },
        setItem: () => {
          throw new Error("storage disabled");
        },
      },
    };

    expect(() => saveBookChoice(undefined, 0, "doubt")).not.toThrow();
    expect(loadBookChoice(undefined, 0)).toBeNull();
  });
});
