import { beforeEach, describe, expect, it, vi } from "vitest";

const createPasskeyWallet = vi.hoisted(() => vi.fn());
const connectPasskeyWallet = vi.hoisted(() => vi.fn());
const disconnectPasskeyWallet = vi.hoisted(() => vi.fn());

vi.mock("./passkey-engine.ts", () => ({
  createPasskeyWallet,
  connectPasskeyWallet,
  disconnectPasskeyWallet,
}));

import { mobileWalletEngine } from "./mobile-engine.ts";

const passkey = {
  address: "CPLAYER",
  rightNetwork: true,
  walletKind: "passkey" as const,
  signer: {
    signTransaction: async () => "",
    signAuthEntry: async () => "",
  },
};

beforeEach(async () => {
  await mobileWalletEngine.disconnect();
  vi.clearAllMocks();
  createPasskeyWallet.mockResolvedValue(passkey);
  connectPasskeyWallet.mockResolvedValue(passkey);
});

describe("mobile wallet engine routing", () => {
  it("disconnects the passkey engine after a passkey connection", async () => {
    expect(await mobileWalletEngine.createPasskey?.()).toBe(passkey);
    await mobileWalletEngine.disconnect();

    expect(disconnectPasskeyWallet).toHaveBeenCalledOnce();
  });

  it("disconnects the passkey engine after an existing passkey connection", async () => {
    expect(await mobileWalletEngine.connectPasskey?.()).toBe(passkey);
    await mobileWalletEngine.disconnect();

    expect(disconnectPasskeyWallet).toHaveBeenCalledOnce();
  });

  it("uses a passkey for the default connection action", async () => {
    expect(await mobileWalletEngine.connect()).toBe(passkey);
    await mobileWalletEngine.disconnect();

    expect(disconnectPasskeyWallet).toHaveBeenCalledOnce();
  });
});
