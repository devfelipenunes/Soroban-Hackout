import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { WalletState } from "../wallet/context.tsx";
import { App } from "../App.tsx";
import { LanguageProvider } from "../i18n/language.tsx";
import { ProgressProvider } from "../game/progress.tsx";

const wallet = vi.hoisted(() => ({ state: { phase: "disconnected" } as WalletState }));
vi.mock("../wallet/context.tsx", () => ({ useWallet: () => ({
  state: wallet.state, address: wallet.state.phase === "connected" ? wallet.state.address : null,
  signer: null, connect: async () => {}, disconnect: async () => {}, reverify: async () => {},
}) }));
vi.mock("../chain/account.tsx", () => ({ useAccount: () => ({ status: { phase: "idle" } }) }));

function home(): string {
  return renderToStaticMarkup(createElement(LanguageProvider, null,
    createElement(ProgressProvider, null,
      createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(App)))));
}

async function homeAfterLazyLoad(): Promise<string> {
  home();
  await import("../pages/Home.tsx");
  await new Promise((resolve) => setTimeout(resolve, 0));
  return home();
}

afterEach(() => { vi.unstubAllGlobals(); wallet.state = { phase: "disconnected" }; });

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
    wallet.state = { phase: "connected", address: "GPLAYER" };
    expect(await homeAfterLazyLoad()).toContain('class="season-home"');
  });
  it("keeps the phone closed on entry", () => {
    wallet.state = { phase: "connected", address: "GPLAYER" };
    expect(home()).not.toContain('class="device__grid"');
  });
});
