import { afterEach, describe, expect, it, vi } from "vitest";

import { executeMobileScript } from "./BreakerDevice.tsx";

afterEach(() => vi.unstubAllGlobals());

describe("executeMobileScript", () => {
  it("returns the value of a lone expression", async () => {
    await expect(executeMobileScript("1 + 1")).resolves.toBe(2);
  });

  it("awaits a promise expression", async () => {
    await expect(
      executeMobileScript("await Promise.resolve({ count: 1 })"),
    ).resolves.toEqual({ count: 1 });
  });

  it("runs a multi-statement script and returns its value", async () => {
    await expect(
      executeMobileScript("const value = 2; return value * 3;"),
    ).resolves.toBe(6);
  });

  it("collects console output when the script returns nothing", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(executeMobileScript("console.log('hello')")).resolves.toBe("hello");
    spy.mockRestore();
  });

  it("propagates a runtime error and restores console.log", async () => {
    const original = console.log;

    await expect(executeMobileScript("throw new Error('boom')")).rejects.toThrow("boom");
    expect(console.log).toBe(original);
  });

  it("does not run a failing expression twice", async () => {
    let calls = 0;
    vi.stubGlobal("__breakerProbe", () => {
      calls += 1;
      throw new Error("boom");
    });

    await expect(executeMobileScript("__breakerProbe()")).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });
});
