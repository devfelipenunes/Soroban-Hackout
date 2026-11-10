import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ deployed: true, connected: true }));

vi.mock("../chain/season.ts", () => ({
  hasSeasonContract: () => state.deployed,
  seasonClient: async () => ({
    has_claimed: async () => ({ result: false }),
    token_of: async () => ({ result: null }),
    claim: async () => ({ signAndSend: async () => ({ result: 1 }) }),
  }),
}));

vi.mock("../wallet/context.tsx", () => ({
  useWallet: () => ({
    address: state.connected ? "GPLAYER" : null,
    signer: state.connected ? {} : null,
  }),
}));

vi.mock("../i18n/language.tsx", () => ({
  useLanguage: () => ({ t: (key: string) => key, language: "pt-BR" }),
}));

import { SeasonClaim } from "./SeasonClaim.tsx";

const render = (completed: boolean): string =>
  renderToStaticMarkup(createElement(SeasonClaim, { completed }));

beforeEach(() => {
  state.deployed = true;
  state.connected = true;
});

describe("season claim gate", () => {
  it("does not render before every case is solved", () => {
    expect(render(false)).toBe("");
  });

  it("does not render when the season contract is not deployed", () => {
    state.deployed = false;
    expect(render(true)).toBe("");
  });

  it("does not render without a connected wallet", () => {
    state.connected = false;
    expect(render(true)).toBe("");
  });

  it("renders the claim check only when the gate is open", () => {
    expect(render(true)).toContain("collection.claimLoading");
  });
});
