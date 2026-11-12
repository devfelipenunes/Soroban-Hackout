import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { HOMEPAGE_IMAGE } from "../levels/index.ts";
import { ResponsiveImage } from "./ResponsiveImage.tsx";

describe("ResponsiveImage", () => {
  it("renders a picture with avif and webp sources", () => {
    const html = renderToStaticMarkup(
      createElement(ResponsiveImage, { src: HOMEPAGE_IMAGE, alt: "Capa", sizes: "100vw" }),
    );

    expect(html).toContain("<picture");
    expect(html).toContain('type="image/avif"');
    expect(html).toContain('type="image/webp"');
    expect(html).toContain('sizes="100vw"');
    expect(html).toContain('width="2048"');
    expect(html).toContain('height="768"');
    expect(html).toContain('src="/images/levels/homepage.webp"');
    expect(html).toContain('alt="Capa"');
  });

  it("omits avif when asked and keeps the priority hint", () => {
    const html = renderToStaticMarkup(
      createElement(ResponsiveImage, {
        src: HOMEPAGE_IMAGE,
        alt: "",
        sizes: "100vw",
        avif: false,
        fetchPriority: "high",
      }),
    );

    expect(html).not.toContain('type="image/avif"');
    expect(html).toContain('type="image/webp"');
    expect(html.toLowerCase()).toContain('fetchpriority="high"');
  });

  it("falls back to a plain img for an unknown source", () => {
    const html = renderToStaticMarkup(
      createElement(ResponsiveImage, {
        src: "/images/unknown.webp",
        alt: "",
        sizes: "100vw",
      }),
    );

    expect(html).not.toContain("<picture");
    expect(html).toContain('src="/images/unknown.webp"');
  });
});
