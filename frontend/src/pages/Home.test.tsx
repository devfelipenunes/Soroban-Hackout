// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { Home } from "./Home.tsx";
import { LanguageProvider } from "../i18n/language.tsx";
import { LEVELS } from "../levels/index.ts";

const season = vi.hoisted(() => ({
  status: "ready" as "cached" | "checking" | "no-wallet" | "ready" | "error",
  completed: [] as boolean[],
  accessible: [] as boolean[],
  solved: 0,
  pending: null as number | null,
  reason: "",
  reload: vi.fn(),
}));

vi.mock("../game/season.ts", () => ({
  useSeasonProgress: () => season,
  lockedLevelIds: () => [],
}));

vi.mock("../game/progress.tsx", () => ({
  useProgress: () => ({
    solvedIds: new Set<number>(),
    markSolved: () => {},
    reset: () => {},
  }),
}));

vi.mock("../components/Mosaic.tsx", () => ({ Mosaic: () => null }));
vi.mock("../components/SeasonClaim.tsx", () => ({ SeasonClaim: () => null }));

function home(): string {
  return renderToStaticMarkup(
    createElement(
      LanguageProvider,
      null,
      createElement(MemoryRouter, null, createElement(Home)),
    ),
  );
}

beforeEach(() => {
  localStorage.setItem("breaker.language", "pt-BR");
  season.status = "ready";
  season.solved = 0;
  season.completed = LEVELS.map(() => false);
  season.accessible = LEVELS.map(() => false);
});

describe("home season progress", () => {
  it("shows the on-chain count when the season read is ready", () => {
    season.solved = 3;
    season.completed = LEVELS.map((_, index) => index < 3);

    const markup = home();

    expect(markup).toContain("3/13 verificados na rede");
    expect(markup).not.toContain("no último acesso");
  });

  it("does not show a count when nothing was solved", () => {
    expect(home()).not.toContain('class="season-progress"');
  });
});
