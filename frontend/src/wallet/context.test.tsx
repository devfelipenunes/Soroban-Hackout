// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WalletProvider, useWallet } from "./context.tsx";
import {
  WalletSelectionCancelled,
  type Connected,
  type WalletEngine,
} from "./engine.ts";

const signer = {
  signTransaction: async () => "",
  signAuthEntry: async () => "",
};

const connected = (overrides: Partial<Connected> = {}): Connected => ({
  address: "GAAA",
  rightNetwork: true,
  signer,
  ...overrides,
});

function engine(overrides: Partial<WalletEngine> = {}): WalletEngine {
  return {
    detect: async () => ({ kind: "available", wallet: "Test wallet" }),
    connect: async () => connected(),
    disconnect: async () => {},
    ...overrides,
  };
}

function renderWallet(walletEngine: WalletEngine) {
  return renderHook(() => useWallet(), {
    wrapper: ({ children }) => (
      <WalletProvider engine={walletEngine}>{children}</WalletProvider>
    ),
  });
}

describe("the wallet state machine", () => {
  it("settles on disconnected after detection", async () => {
    const { result } = renderWallet(engine());

    expect(result.current.state.phase).toBe("checking");
    await waitFor(() => expect(result.current.state.phase).toBe("disconnected"));
  });

  it("connects and exposes the address and signer", async () => {
    const { result } = renderWallet(engine());
    await waitFor(() => expect(result.current.state.phase).toBe("disconnected"));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state).toEqual({
      phase: "connected",
      address: "GAAA",
      transactionSource: "GAAA",
      walletKind: "stellar",
    });
    expect(result.current.address).toBe("GAAA");
    expect(result.current.signer).toBe(signer);
  });

  it("keeps a wrong-network connection out of the connected state", async () => {
    const { result } = renderWallet(
      engine({ connect: async () => connected({ rightNetwork: false }) }),
    );
    await waitFor(() => expect(result.current.state.phase).toBe("disconnected"));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state).toEqual({ phase: "wrong-network", address: "GAAA" });
    expect(result.current.signer).toBeNull();
  });

  it("marks a connection with an unverified network", async () => {
    const { result } = renderWallet(
      engine({ connect: async () => connected({ rightNetwork: null }) }),
    );
    await waitFor(() => expect(result.current.state.phase).toBe("disconnected"));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state).toEqual({
      phase: "network-unverified",
      address: "GAAA",
    });
  });

  it("returns to disconnected when the wallet selection is cancelled", async () => {
    const { result } = renderWallet(
      engine({
        connect: async () => {
          throw new WalletSelectionCancelled();
        },
      }),
    );
    await waitFor(() => expect(result.current.state.phase).toBe("disconnected"));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state.phase).toBe("disconnected");
  });

  it("reports the reason a connection failed", async () => {
    const { result } = renderWallet(
      engine({
        connect: async () => {
          throw new Error("boom");
        },
      }),
    );
    await waitFor(() => expect(result.current.state.phase).toBe("disconnected"));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state).toEqual({ phase: "failed", reason: "boom" });
  });

  it("clears the signer on disconnect", async () => {
    const { result } = renderWallet(engine());
    await waitFor(() => expect(result.current.state.phase).toBe("disconnected"));

    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.disconnect();
    });

    expect(result.current.state.phase).toBe("disconnected");
    expect(result.current.signer).toBeNull();
  });

  it("only exposes passkey actions the engine provides", async () => {
    const plain = renderWallet(engine());
    await waitFor(() => expect(plain.result.current.state.phase).toBe("disconnected"));
    expect(plain.result.current.createPasskey).toBeNull();
    expect(plain.result.current.connectPasskey).toBeNull();

    const passkeyEngine = engine({
      createPasskey: async () => connected({ walletKind: "passkey" }),
      connectPasskey: async () => connected({ walletKind: "passkey" }),
    });
    const passkey = renderWallet(passkeyEngine);
    await waitFor(() => expect(passkey.result.current.state.phase).toBe("disconnected"));
    expect(passkey.result.current.createPasskey).not.toBeNull();
    expect(passkey.result.current.connectPasskey).not.toBeNull();
  });
});
