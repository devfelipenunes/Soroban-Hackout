import { describe, expect, it } from "vitest";

import { mobileWalletEngine } from "./mobile-engine.ts";

describe("passkey wallet engine", () => {
  it("does not claim a detected wallet before the player acts", async () => {
    await expect(mobileWalletEngine.detect()).resolves.toEqual({ kind: "unchecked" });
  });

  it("routes the default connection through the passkey action", () => {
    expect(mobileWalletEngine.connect).toBe(mobileWalletEngine.connectPasskey);
    expect(mobileWalletEngine.createPasskey).toBeTypeOf("function");
  });
});
