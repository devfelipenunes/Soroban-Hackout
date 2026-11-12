import { beforeEach, describe, expect, it, vi } from "vitest";

const realConnect = vi.hoisted(() => vi.fn());
const realDisconnect = vi.hoisted(() => vi.fn());
const createPasskeyWallet = vi.hoisted(() => vi.fn());
const connectPasskeyWallet = vi.hoisted(() => vi.fn());
const disconnectPasskeyWallet = vi.hoisted(() => vi.fn());

vi.mock("./real-engine.ts", () => ({
  realEngine: {
    detect: async () => ({ kind: "unchecked" }),
    connect: realConnect,
    disconnect: realDisconnect,
  },
}));

vi.mock("./passkey-engine.ts", () => ({
  createPasskeyWallet,
  connectPasskeyWallet,
  disconnectPasskeyWallet,
}));

import { mobileWalletEngine } from "./mobile-engine.ts";

const stellar = {
  address: "GPLAYER",
  rightNetwork: true,
  signer: {
    signTransaction: async () => "",
    signAuthEntry: async () => "",
  },
};

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
  realConnect.mockResolvedValue(stellar);
  createPasskeyWallet.mockResolvedValue(passkey);
  connectPasskeyWallet.mockResolvedValue(passkey);
});

describe("mobile wallet engine routing", () => {
  it("disconnects the passkey engine after a passkey connection", async () => {
    expect(await mobileWalletEngine.createPasskey?.()).toBe(passkey);
    await mobileWalletEngine.disconnect();

    expect(disconnectPasskeyWallet).toHaveBeenCalledOnce();
    expect(realDisconnect).not.toHaveBeenCalled();
  });

  it("disconnects the passkey engine after an existing passkey connection", async () => {
    expect(await mobileWalletEngine.connectPasskey?.()).toBe(passkey);
    await mobileWalletEngine.disconnect();

    expect(disconnectPasskeyWallet).toHaveBeenCalledOnce();
    expect(realDisconnect).not.toHaveBeenCalled();
  });

  it("disconnects Stellar when the last connection was a Stellar wallet", async () => {
    expect(await mobileWalletEngine.connect()).toBe(stellar);
    await mobileWalletEngine.disconnect();

    expect(realDisconnect).toHaveBeenCalledOnce();
    expect(disconnectPasskeyWallet).not.toHaveBeenCalled();
  });
});
