import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("smart-account-kit", () => ({
  IndexedDBStorage: class {},
  SmartAccountKit: class {},
}));

import {
  assertPasskeyEnvironment,
  isTransientFundingError,
  PASSKEY_DEPLOYMENT,
} from "./passkey-engine.ts";

afterEach(() => vi.unstubAllGlobals());

describe("passkey environment", () => {
  it("rejects an insecure context", async () => {
    vi.stubGlobal("window", {
      isSecureContext: false,
      location: { hostname: "example.com" },
    });

    await expect(assertPasskeyEnvironment()).rejects.toThrow(/secure HTTPS/);
  });

  it("rejects 127.0.0.1 so the test origin is localhost", async () => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      location: { hostname: "127.0.0.1" },
    });

    await expect(assertPasskeyEnvironment()).rejects.toThrow(/http:\/\/localhost/);
  });

  it("rejects a browser without WebAuthn", async () => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", { credentials: undefined });
    vi.stubGlobal("PublicKeyCredential", undefined);

    await expect(assertPasskeyEnvironment()).rejects.toThrow(/does not support passkeys/);
  });

  it("rejects a device without an on-device authenticator", async () => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", { credentials: {} });
    vi.stubGlobal(
      "PublicKeyCredential",
      Object.assign(function PublicKeyCredential() {}, {
        isUserVerifyingPlatformAuthenticatorAvailable: async () => false,
      }),
    );

    await expect(assertPasskeyEnvironment()).rejects.toThrow(/did not find an on-device passkey/);
  });

  it("accepts an available platform authenticator", async () => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      location: { hostname: "localhost" },
    });
    vi.stubGlobal("navigator", { credentials: {} });
    vi.stubGlobal(
      "PublicKeyCredential",
      Object.assign(function PublicKeyCredential() {}, {
        isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
      }),
    );

    await expect(assertPasskeyEnvironment()).resolves.toBeUndefined();
  });
});

describe("passkey deployment", () => {
  it("keeps the account wasm and verifier well-formed", () => {
    expect(PASSKEY_DEPLOYMENT.accountWasmHash).toMatch(/^[0-9a-f]{64}$/);
    expect(PASSKEY_DEPLOYMENT.webauthnVerifier).toMatch(/^C[A-Z2-7]{55}$/);
    for (const hash of PASSKEY_DEPLOYMENT.acceptedWasmHashes) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const hash of PASSKEY_DEPLOYMENT.acceptedBirthWasmHashes) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(PASSKEY_DEPLOYMENT.acceptedWasmHashes).toContain(
      PASSKEY_DEPLOYMENT.accountWasmHash,
    );
    expect(PASSKEY_DEPLOYMENT.acceptedBirthWasmHashes).toContain(
      PASSKEY_DEPLOYMENT.accountWasmHash,
    );
  });
});

describe("funding errors", () => {
  it("treats rate limits and not-found as transient", () => {
    expect(isTransientFundingError(new Error("HTTP 429 Too Many Requests"))).toBe(true);
    expect(isTransientFundingError(new Error("Funding address failed: transaction status NOT_FOUND"))).toBe(true);
    expect(isTransientFundingError(new Error("request timed out"))).toBe(true);
  });

  it("does not retry a hard rejection", () => {
    expect(isTransientFundingError(new Error("Invalid address"))).toBe(false);
    expect(isTransientFundingError(new Error("Bad Request: account already funded"))).toBe(false);
  });
});
