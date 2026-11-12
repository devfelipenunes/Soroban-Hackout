import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HOMEPAGE_IMAGE, responsiveImage, srcSetOf } from "./index.ts";

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), "../../public");
const fileOf = (url: string): string => resolve(PUBLIC, url.replace(/^\//, ""));

const SOURCES = [
  HOMEPAGE_IMAGE,
  "/images/seasons/lumen.webp",
  "/images/seasons/veil.webp",
  "/images/login/meridian.webp",
  "/images/brand/breaker-os-presentation.png",
];

describe("responsive image manifest", () => {
  it("records generated files that exist on disk", () => {
    for (const src of SOURCES) {
      const image = responsiveImage(src);
      expect(image, src).not.toBeNull();
      if (image === null) continue;

      expect(image.webp.length, `${src} webp`).toBeGreaterThan(0);
      for (const variant of [...image.webp, ...image.avif]) {
        expect(existsSync(fileOf(variant.url)), variant.url).toBe(true);
      }
    }
  });

  it("returns null for an unknown source", () => {
    expect(responsiveImage("/images/does-not-exist.webp")).toBeNull();
  });

  it("builds a srcset in ascending width order", () => {
    const image = responsiveImage(HOMEPAGE_IMAGE);
    expect(image).not.toBeNull();
    if (image === null) return;

    const srcset = srcSetOf(image.webp);
    const entries = srcset.split(", ");
    expect(entries[0]).toMatch(/ 768w$/);
    expect(entries[entries.length - 1]).toMatch(/ 2048w$/);
  });
});
