import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Markdown } from "./Markdown.tsx";

describe("the markdown renderer", () => {
  it("neutralizes a javascript: link", () => {
    const html = renderToStaticMarkup(<Markdown source={"[x](javascript:alert(1))"} />);

    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });

  it("drops a desktop-only block when the console code is hidden", () => {
    const html = renderToStaticMarkup(
      <Markdown
        source={"[[desktop-only]]\nconsole path\n[[/desktop-only]]\n\nshared path"}
        consoleCode="hide"
      />,
    );

    expect(html).not.toContain("console path");
    expect(html).toContain("shared path");
    expect(html).not.toContain("desktop-only");
  });

  it("keeps a desktop-only block on desktop and strips its markers", () => {
    const html = renderToStaticMarkup(
      <Markdown source={"[[desktop-only]]console path[[/desktop-only]]"} />,
    );

    expect(html).toContain("console path");
    expect(html).not.toContain("desktop-only");
  });

  it("drops an inline desktop-only sentence when the console code is hidden", () => {
    const html = renderToStaticMarkup(
      <Markdown
        source={"keep [[desktop-only]]drop[[/desktop-only]] end"}
        consoleCode="hide"
      />,
    );

    expect(html).toContain("keep");
    expect(html).toContain("end");
    expect(html).not.toContain("drop");
    expect(html).not.toContain("desktop-only");
  });
});
