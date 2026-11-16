// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";

import { Gate } from "./Gate.tsx";
import { LanguageProvider } from "../i18n/language.tsx";
import { WalletProvider } from "../wallet/context.tsx";
import type { WalletEngine } from "../wallet/engine.ts";

const signer = {
  signTransaction: async () => "",
  signAuthEntry: async () => "",
};

function setup(
  createPasskey: WalletEngine["createPasskey"],
  connectPasskey: WalletEngine["connectPasskey"],
) {
  const engine: WalletEngine = {
    detect: async () => ({ kind: "unchecked" }),
    connect: async () => {
      throw new Error("unexpected default connection");
    },
    createPasskey,
    connectPasskey,
    disconnect: async () => {},
  };

  return render(
    <LanguageProvider>
      <WalletProvider engine={engine}>
        <Gate onClose={() => {}} />
      </WalletProvider>
    </LanguageProvider>,
  );
}

describe("Gate passkey actions", () => {
  it("retries the creation that failed instead of switching to connect", async () => {
    const createPasskey = vi.fn(async () => {
      throw new Error("funding failed");
    });
    const connectPasskey = vi.fn(async () => ({
      address: "CPLAYER",
      rightNetwork: true,
      signer,
      walletKind: "passkey" as const,
    }));
    const view = setup(createPasskey, connectPasskey);

    await waitFor(() =>
      expect(view.container.querySelector(".gate__actions")).not.toBeNull(),
    );
    const createButton = view.container.querySelector(
      ".gate__actions .button--secondary",
    );
    expect(createButton).not.toBeNull();
    fireEvent.click(createButton as Element);

    await waitFor(() =>
      expect(view.container.querySelector(".gate__detail")?.textContent).toContain(
        "funding failed",
      ),
    );
    const retry = view.container.querySelector(
      ".gate__actions .button:not(.button--secondary)",
    );
    expect(retry).not.toBeNull();
    fireEvent.click(retry as Element);

    await waitFor(() => expect(createPasskey).toHaveBeenCalledTimes(2));
    expect(connectPasskey).not.toHaveBeenCalled();
  });
});
