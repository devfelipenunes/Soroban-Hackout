import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { LanguageProvider } from "../i18n/language.tsx";
import { Help } from "./Help.tsx";

function render(matches: boolean): string {
  vi.stubGlobal("window", {
    matchMedia: vi.fn().mockReturnValue({ matches }),
  });

  return renderToStaticMarkup(
    createElement(
      LanguageProvider,
      null,
      createElement(MemoryRouter, null, createElement(Help)),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Help by viewport", () => {
  it("points mobile players to Operations instead of DevTools", () => {
    const html = render(true);

    expect(html).toContain("Operações é a sua interface");
    expect(html).not.toContain("F12");
  });

  it("keeps the DevTools instructions on desktop", () => {
    const html = render(false);

    expect(html).toContain("O console é a sua interface");
    expect(html).toContain("F12");
  });
});
