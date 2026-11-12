import { afterEach, describe, expect, it, vi } from "vitest";

import { isMobileGameplayDevice, MOBILE_GAMEPLAY_QUERY } from "./viewport.ts";

afterEach(() => vi.unstubAllGlobals());

describe("mobile gameplay viewport", () => {
  it("counts any coarse pointer, not only the primary one", () => {
    expect(MOBILE_GAMEPLAY_QUERY).toContain("any-pointer: coarse");
  });

  it("matches a narrow touch viewport", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    });

    expect(isMobileGameplayDevice()).toBe(true);
  });

  it("does not match a desktop viewport", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    expect(isMobileGameplayDevice()).toBe(false);
  });

  it("answers false when there is no window", () => {
    vi.stubGlobal("window", undefined);

    expect(isMobileGameplayDevice()).toBe(false);
  });
});
