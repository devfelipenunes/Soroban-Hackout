import { describe, expect, it } from "vitest";

import { migrateLegacyStorage } from "./storage.ts";

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe("legacy storage migration", () => {
  it("moves dotted and colon keys to the current prefix", () => {
    const storage = new MemoryStorage();
    storage.setItem("brecha.language", "en");
    storage.setItem("brecha.case.v3.GPLAYER.4", "{}");
    storage.setItem("brecha:open-os", "1");

    expect(migrateLegacyStorage(storage)).toBe(3);
    expect(storage.getItem("breaker.language")).toBe("en");
    expect(storage.getItem("breaker.case.v3.GPLAYER.4")).toBe("{}");
    expect(storage.getItem("breaker:open-os")).toBe("1");
    expect(storage.getItem("brecha.language")).toBeNull();
  });

  it("keeps a current key that already exists", () => {
    const storage = new MemoryStorage();
    storage.setItem("brecha.book.GPLAYER.4", "old");
    storage.setItem("breaker.book.GPLAYER.4", "new");

    migrateLegacyStorage(storage);
    expect(storage.getItem("breaker.book.GPLAYER.4")).toBe("new");
    expect(storage.getItem("brecha.book.GPLAYER.4")).toBeNull();
  });

  it("does nothing when storage is unavailable", () => {
    expect(migrateLegacyStorage(undefined)).toBe(0);
  });
});
