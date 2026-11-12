import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadOperationDraft,
  operationDraftKey,
  saveOperationDraft,
} from "./BreakerDevice.tsx";

function storage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  } as Storage;
}

function useStorage(): Storage {
  const local = storage();
  vi.stubGlobal("window", { localStorage: local });
  return local;
}

afterEach(() => vi.unstubAllGlobals());

describe("operations notebook draft", () => {
  it("scopes the draft by player, level and schema version", () => {
    expect(operationDraftKey("GPLAYER", 3)).toBe("breaker.mobile-operations.v2.GPLAYER.3");
    expect(operationDraftKey(undefined, -1)).toBe("breaker.mobile-operations.v2.anon.-1");
  });

  it("round-trips the cells", () => {
    const local = useStorage();
    saveOperationDraft("GPLAYER", 0, [
      { id: "one", source: "await window.contract.count()" },
      { id: "two", source: "" },
    ]);

    expect(loadOperationDraft("GPLAYER", 0)).toEqual([
      { id: "one", source: "await window.contract.count()" },
      { id: "two", source: "" },
    ]);
    expect(local.getItem(operationDraftKey("GPLAYER", 0))).toContain("contract.count");
  });

  it("migrates the single-cell v1 draft", () => {
    const local = useStorage();
    local.setItem(operationDraftKey("GPLAYER", 0, 1), "await window.contract.count()");

    expect(loadOperationDraft("GPLAYER", 0)).toEqual([
      { id: "cell-1", source: "await window.contract.count()" },
    ]);
  });

  it("drops malformed cells but keeps the valid ones", () => {
    const local = useStorage();
    local.setItem(
      operationDraftKey("GPLAYER", 0),
      JSON.stringify([
        { id: "valid", source: "return 1" },
        { id: 2, source: "missing id" },
        "not a cell",
      ]),
    );

    expect(loadOperationDraft("GPLAYER", 0)).toEqual([
      { id: "valid", source: "return 1" },
    ]);
  });

  it("round-trips the structured plan metadata", () => {
    useStorage();
    saveOperationDraft("GPLAYER", 0, [
      {
        id: "transfer",
        source: "return await window.contract.transfer({ to: window.player });",
        method: "transfer",
        args: { to: "window.player" },
        variants: {},
      },
    ]);

    expect(loadOperationDraft("GPLAYER", 0)).toEqual([
      {
        id: "transfer",
        source: "return await window.contract.transfer({ to: window.player });",
        method: "transfer",
        args: { to: "window.player" },
        variants: {},
      },
    ]);
  });

  it("drops a cell whose plan metadata is not a string record", () => {
    const local = useStorage();
    local.setItem(
      operationDraftKey("GPLAYER", 0),
      JSON.stringify([
        { id: "bad", source: "return 1", args: { n: 1 } },
        { id: "good", source: "return 2" },
      ]),
    );

    expect(loadOperationDraft("GPLAYER", 0)).toEqual([
      { id: "good", source: "return 2" },
    ]);
  });

  it("round-trips a wait step", () => {
    useStorage();
    saveOperationDraft("GPLAYER", 0, [
      {
        id: "wait",
        source: "await new Promise((resolve) => setTimeout(resolve, 5000));",
        waitMs: 5000,
      },
    ]);

    expect(loadOperationDraft("GPLAYER", 0)).toEqual([
      {
        id: "wait",
        source: "await new Promise((resolve) => setTimeout(resolve, 5000));",
        waitMs: 5000,
      },
    ]);
  });

  it("drops a cell whose wait metadata is invalid", () => {
    const local = useStorage();
    local.setItem(
      operationDraftKey("GPLAYER", 0),
      JSON.stringify([
        { id: "bad", source: "return 1", waitMs: -1 },
        { id: "good", source: "return 2" },
      ]),
    );

    expect(loadOperationDraft("GPLAYER", 0)).toEqual([
      { id: "good", source: "return 2" },
    ]);
  });

  it("starts a fresh cell when the stored JSON is corrupt", () => {
    const local = useStorage();
    local.setItem(operationDraftKey("GPLAYER", 0), "{not json");

    const cells = loadOperationDraft("GPLAYER", 0);
    expect(cells).toHaveLength(1);
    expect(cells[0]?.source).toBe("");
  });
});
