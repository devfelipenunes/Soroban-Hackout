// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { WalletState } from "../wallet/context.tsx";
import { App } from "../App.tsx";
import { LanguageProvider } from "../i18n/language.tsx";
import { ProgressProvider } from "../game/progress.tsx";

const wallet = vi.hoisted(() => ({
  state: { phase: "disconnected" } as WalletState,
  createPasskey: vi.fn(async () => {}),
  connectPasskey: vi.fn(async () => {}),
}));
vi.mock("../wallet/context.tsx", () => ({ useWallet: () => ({
  state: wallet.state,
  address: wallet.state.phase === "connected" ? wallet.state.address : null,
  signer: null,
  walletKind: wallet.state.phase === "connected" ? wallet.state.walletKind : null,
  testOnly: false,
  connect: async () => {},
  createPasskey: wallet.createPasskey,
  connectPasskey: wallet.connectPasskey,
  disconnect: async () => {},
  reverify: async () => {},
}) }));
vi.mock("../chain/account.tsx", () => ({ useAccount: () => ({ status: { phase: "idle" } }) }));

function home(): string {
  return renderToStaticMarkup(createElement(LanguageProvider, null,
    createElement(ProgressProvider, null,
      createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(App)))));
}

function loginElement() {
  return createElement(LanguageProvider, null,
    createElement(MemoryRouter, { initialEntries: ["/login"] }, createElement(App)));
}

async function homeAfterLazyLoad(): Promise<string> {
  home();
  await import("../pages/Home.tsx");
  await new Promise((resolve) => setTimeout(resolve, 0));
  return home();
}

beforeEach(() => {
  wallet.createPasskey.mockClear();
  wallet.connectPasskey.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  wallet.state = { phase: "disconnected" };
});

describe("wallet-only entry", () => {
  it("does not render the home while checking the wallet", () => {
    wallet.state = { phase: "checking" };
    expect(home()).not.toContain('class="season-home"');
  });
  it("does not accept forged browser entry markers", () => {
    const storage = { getItem: () => "1" };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { localStorage: storage });
    expect(home()).not.toContain('class="season-home"');
  });
  it("does not render the home on the wrong network", () => {
    wallet.state = { phase: "wrong-network", address: "GPLAYER" };
    expect(home()).not.toContain('class="season-home"');
  });
  it("renders the home when the wallet is connected without browser markers", async () => {
    wallet.state = { phase: "connected", address: "GPLAYER", transactionSource: "GPLAYER", walletKind: "stellar" };
    expect(await homeAfterLazyLoad()).toContain('class="season-home"');
  });
  it("keeps the phone closed on entry", () => {
    wallet.state = { phase: "connected", address: "GPLAYER", transactionSource: "GPLAYER", walletKind: "stellar" };
    expect(home()).not.toContain('class="device__grid"');
  });
});

describe("passkey entry", () => {
  it("shows the failure instead of returning to the buttons silently", async () => {
    wallet.state = { phase: "failed", reason: "passkey denied" };
    const view = render(loginElement());
    await waitFor(() =>
      expect(view.container.textContent).toContain("passkey denied"),
    );
    expect(view.container.querySelector(".login__passkey-retry")).not.toBeNull();
  });

  it("retries the action that failed", async () => {
    const view = render(loginElement());
    await waitFor(() =>
      expect(view.container.querySelector(".login__button--passkey")).not.toBeNull(),
    );
    fireEvent.click(view.container.querySelector(".login__button--passkey") as Element);
    expect(wallet.createPasskey).toHaveBeenCalledTimes(1);

    wallet.state = { phase: "failed", reason: "boom" };
    view.rerender(loginElement());
    await waitFor(() =>
      expect(view.container.querySelector(".login__passkey-retry")).not.toBeNull(),
    );
    fireEvent.click(view.container.querySelector(".login__passkey-retry") as Element);

    expect(wallet.createPasskey).toHaveBeenCalledTimes(2);
    expect(wallet.connectPasskey).not.toHaveBeenCalled();
  });
});
