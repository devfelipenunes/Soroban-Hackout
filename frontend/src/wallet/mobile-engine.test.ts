import { afterEach, describe, expect, it, vi } from "vitest";

import { realEngine } from "./real-engine.ts";
import { mobileWalletEngine, walletEngineForViewport } from "./mobile-engine.ts";

afterEach(() => vi.unstubAllGlobals());

describe("viewport wallet engine", () => {
  it("preserves the existing wallet engine on desktop", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });

    expect(walletEngineForViewport()).toBe(realEngine);
  });

  it("adds passkey actions only to the mobile wallet engine", () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    });

    const engine = walletEngineForViewport();
    expect(engine).toBe(mobileWalletEngine);
    expect(engine.createPasskey).toBeTypeOf("function");
    expect(engine.connectPasskey).toBeTypeOf("function");
  });
});
