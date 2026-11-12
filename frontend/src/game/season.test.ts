import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CoreReads } from "../chain/level.ts";
import { LEVELS } from "../levels/index.ts";
import {
  activateSeasonCache,
  clearSeasonCache,
  loadStoredSeason,
  lockedLevelIds,
  readSeason,
} from "./season.ts";

const fake = (): {
  client: CoreReads;
  calls: () => number;
  instanceCalls: () => number;
} => {
  let calls = 0;
  let instanceCalls = 0;
  const client: CoreReads = {
    instances: async () => {
      calls += 1;
      instanceCalls += 1;
      return { result: [] };
    },
    is_completed: async () => {
      calls += 1;
      return { result: false };
    },
    can_access: async () => ({ result: true }),
  };
  return { client, calls: () => calls, instanceCalls: () => instanceCalls };
};

beforeEach(() => clearSeasonCache());
afterEach(() => vi.unstubAllGlobals());

describe("lockedLevelIds", () => {
  it("does not lock cases when progress could not be read", () => {
    expect(lockedLevelIds("error", [0, 1, 2], [false, false, false])).toEqual([]);
    expect(lockedLevelIds("checking", [0, 1], [false, false])).toEqual([]);
  });

  it("locks only the cases the chain marks inaccessible", () => {
    expect(lockedLevelIds("ready", [0, 1, 2], [true, false, true])).toEqual([1]);
  });
});

describe("the season read cache", () => {
  it("reads each level's verdict once and then serves the cache", async () => {
    const { client, calls, instanceCalls } = fake();

    const first = await readSeason(client, "GAAA");

    expect(first).toHaveLength(LEVELS.length);
    expect(calls()).toBe(LEVELS.length);
    expect(instanceCalls()).toBe(0);

    const second = await readSeason(client, "GAAA");

    expect(second).toBe(first);
    expect(calls()).toBe(LEVELS.length);
  });

  it("refetches after the cache is cleared", async () => {
    const { client, calls } = fake();

    await readSeason(client, "GAAA");
    clearSeasonCache("GAAA");
    await readSeason(client, "GAAA");

    expect(calls()).toBe(LEVELS.length * 2);
  });

  it("shares one in-flight read between concurrent callers", async () => {
    const { client, calls } = fake();

    const [a, b] = await Promise.all([
      readSeason(client, "GAAA"),
      readSeason(client, "GAAA"),
    ]);

    expect(a).toBe(b);
    expect(calls()).toBe(LEVELS.length);
  });

  it("accepts only a fresh, complete local progress snapshot", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });

    const { client } = fake();
    activateSeasonCache("GAAA");
    return readSeason(client, "GAAA").then(() => {
      const stored = loadStoredSeason("GAAA");
      expect(stored?.completed).toHaveLength(LEVELS.length);
      expect(stored).not.toBeNull();
      expect(loadStoredSeason("GAAA", (stored?.at ?? 0) + 301_000)).toBeNull();

      const key = [...values.keys()].find((item) => item.startsWith("breaker.season.v2.testnet:"));
      expect(key).toBeDefined();
      values.set(key ?? "", JSON.stringify({ completed: [true], at: Date.now() }));
      expect(loadStoredSeason("GAAA")).toBeNull();
    });
  });

  it("uses a fresh v1 snapshot immediately and promotes it to the scoped cache", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const legacyKey = "breaker.season.v1.testnet:GAAA";
    const legacy = { completed: LEVELS.map(() => true), at: Date.now() };
    values.set(legacyKey, JSON.stringify(legacy));

    expect(loadStoredSeason("GAAA")).toEqual(legacy);

    activateSeasonCache("GAAA");
    const { client } = fake();
    await readSeason(client, "GAAA");
    expect([...values.keys()].some((key) => key.startsWith("breaker.season.v2.testnet:"))).toBe(true);
  });

  it("drops the previous wallet snapshot when another wallet becomes active", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const { client } = fake();

    activateSeasonCache("GAAA");
    await readSeason(client, "GAAA");
    expect(loadStoredSeason("GAAA")).not.toBeNull();

    activateSeasonCache("GBBB");

    expect(loadStoredSeason("GAAA")).toBeNull();
    expect([...values.entries()].find(([key]) => key.startsWith("breaker.season.v2.active.testnet:"))?.[1]).toBe("GBBB");
  });
});
