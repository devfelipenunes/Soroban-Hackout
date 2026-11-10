import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Markdown } from "./Markdown.tsx";

describe("the markdown renderer", () => {
  it("neutralizes a javascript: link", () => {
    const html = renderToStaticMarkup(<Markdown source={"[x](javascript:alert(1))"} />);

    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });
});
