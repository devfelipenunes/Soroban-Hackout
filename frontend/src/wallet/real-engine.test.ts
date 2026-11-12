import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kit = vi.hoisted(() => ({
  init: vi.fn(),
  authModal: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
  signAuthEntry: vi.fn(),
  disconnect: vi.fn(),
  refreshSupportedWallets: vi.fn(),
}));

vi.mock("@creit.tech/stellar-wallets-kit/sdk", () => ({ StellarWalletsKit: kit }));

const fakeModule = vi.hoisted(() => (productId: string) => class {
  productId = productId;
});

vi.mock("@creit.tech/stellar-wallets-kit/modules/freighter", () => ({
  FreighterModule: fakeModule("freighter"),
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/xbull", () => ({
  xBullModule: fakeModule("xbull"),
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/albedo", () => ({
  AlbedoModule: fakeModule("albedo"),
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/rabet", () => ({
  RabetModule: fakeModule("rabet"),
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/hana", () => ({
  HanaModule: fakeModule("hana"),
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/klever", () => ({
  KleverModule: fakeModule("klever"),
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/bitget", () => ({
  BitgetModule: fakeModule("BitgetWallet"),
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/onekey", () => ({
  OneKeyModule: fakeModule("onekey"),
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/cactuslink", () => ({
  CactusLinkModule: fakeModule("cactuslink"),
}));
vi.mock("@creit.tech/stellar-wallets-kit/modules/scopuly", () => ({
  ScopulyModule: fakeModule("scopuly"),
}));

import { PASSPHRASE } from "../chain/network.ts";
import { WalletSelectionCancelled } from "./engine.ts";
import { realEngine } from "./real-engine.ts";

beforeEach(() => {
  vi.stubGlobal("window", {});
  kit.init.mockClear();
  kit.authModal.mockReset();
  kit.getNetwork.mockReset();
  kit.signTransaction.mockReset();
  kit.signAuthEntry.mockReset();
  kit.refreshSupportedWallets.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("real wallet engine", () => {
  it("defers wallet SDK loading until the player connects", async () => {
    await expect(realEngine.detect()).resolves.toEqual({ kind: "unchecked" });
    expect(kit.init).not.toHaveBeenCalled();
    expect(kit.refreshSupportedWallets).not.toHaveBeenCalled();
  });

  it("keeps the LOBSTR warning when it is the only wallet present", async () => {
    vi.stubGlobal("window", { lobstr: {} });
    kit.refreshSupportedWallets.mockResolvedValue([{ name: "Freighter", isAvailable: false }]);

    await expect(realEngine.detect()).resolves.toEqual({
      kind: "incompatible",
      wallet: "LOBSTR",
    });
  });

  it("connects with the address chosen in the kit modal", async () => {
    kit.authModal.mockResolvedValue({ address: "GPLAYER" });
    kit.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: PASSPHRASE });

    const connected = await realEngine.connect();

    expect(connected).toMatchObject({ address: "GPLAYER", rightNetwork: true });
  });

  it("sets the wallet kit to Testnet on every viewport", async () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });
    kit.authModal.mockResolvedValue({ address: "GPLAYER" });
    kit.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: PASSPHRASE });

    await realEngine.connect();

    expect(kit.init).toHaveBeenCalledWith(expect.objectContaining({ network: PASSPHRASE }));
  });

  it("flags a wallet that is on another network", async () => {
    kit.authModal.mockResolvedValue({ address: "GPLAYER" });
    kit.getNetwork.mockResolvedValue({
      network: "PUBLIC",
      networkPassphrase: "Public Global Stellar Network ; September 2015",
    });

    await expect(realEngine.connect()).resolves.toMatchObject({ rightNetwork: false });
  });

  it("signs with the testnet passphrase and the connected address", async () => {
    kit.authModal.mockResolvedValue({ address: "GPLAYER" });
    kit.getNetwork.mockResolvedValue({ network: "TESTNET", networkPassphrase: PASSPHRASE });
    kit.signTransaction.mockResolvedValue({ signedTxXdr: "signed-tx" });
    kit.signAuthEntry.mockResolvedValue({ signedAuthEntry: "signed-entry" });

    const { signer } = await realEngine.connect();

    await expect(signer.signTransaction("tx-xdr")).resolves.toBe("signed-tx");
    await expect(signer.signAuthEntry("entry-xdr")).resolves.toBe("signed-entry");
    expect(kit.signTransaction).toHaveBeenCalledWith("tx-xdr", {
      networkPassphrase: PASSPHRASE,
      address: "GPLAYER",
    });
    expect(kit.signAuthEntry).toHaveBeenCalledWith("entry-xdr", {
      networkPassphrase: PASSPHRASE,
      address: "GPLAYER",
    });
  });

  it("turns closing the modal into a cancellation, not a failure", async () => {
    kit.authModal.mockRejectedValue({ code: -1, message: "The user closed the modal." });

    await expect(realEngine.connect()).rejects.toBeInstanceOf(WalletSelectionCancelled);
  });

  it("rethrows any other wallet error untouched", async () => {
    const failure = new Error("wallet exploded");
    kit.authModal.mockRejectedValue(failure);

    await expect(realEngine.connect()).rejects.toBe(failure);
  });

  it("does not treat an unknown wallet network as verified", async () => {
    kit.authModal.mockResolvedValue({ address: "GPLAYER" });
    kit.getNetwork.mockRejectedValue(new Error("no network"));

    await expect(realEngine.connect()).resolves.toMatchObject({ rightNetwork: null });
  });
});
