import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BreachRoom } from "./BreachRoom.tsx";

function render(): string {
  return renderToStaticMarkup(
    createElement(BreachRoom, {
      notebook: createElement("div", null, "NOTEBOOK"),
    }),
  );
}

describe("BreachRoom", () => {
  it("opens directly on notebook cells without tab navigation", () => {
    const html = render();

    expect(html).toContain("NOTEBOOK");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
  });
});
