import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = resolve(FRONTEND, "public");

const read = (path: string): string => readFileSync(resolve(FRONTEND, path), "utf8");

describe("PWA shell", () => {
  it("serves and preloads fonts locally", () => {
    const html = read("index.html");

    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
    expect(html).toContain(
      'href="/fonts/cormorant-garamond-latin-v21.woff2" as="font" type="font/woff2" crossorigin',
    );
    expect(html).toContain(
      'href="/fonts/ibm-plex-sans-latin-v23.woff2" as="font" type="font/woff2" crossorigin',
    );
  });

  it("preloads the hero image per route", () => {
    expect(read("index.html")).toContain("data-breaker-hero-preload");
  });

  it("ships the font files and their licenses", () => {
    for (const file of [
      "cormorant-garamond-latin-v21.woff2",
      "cormorant-garamond-latin-ext-v21.woff2",
      "ibm-plex-sans-latin-v23.woff2",
      "ibm-plex-sans-latin-ext-v23.woff2",
      "OFL-CormorantGaramond.txt",
      "OFL-IBMPlexSans.txt",
    ]) {
      expect(existsSync(resolve(PUBLIC, "fonts", file)), file).toBe(true);
    }
  });

  it("generates the service worker instead of shipping a hand-written one", () => {
    expect(existsSync(resolve(PUBLIC, "sw.js"))).toBe(false);
  });

  it("points every manifest icon at an existing file", () => {
    const manifest = JSON.parse(read("public/manifest.webmanifest")) as {
      icons: { src: string }[];
    };

    for (const icon of manifest.icons) {
      expect(existsSync(resolve(PUBLIC, icon.src.replace(/^\//, ""))), icon.src).toBe(true);
    }
  });

  it("requests fullscreen on Android and a translucent status bar on iOS", () => {
    const manifest = JSON.parse(read("public/manifest.webmanifest")) as {
      display?: string;
      display_override?: string[];
    };
    const html = read("index.html");

    expect(manifest.display).toBe("standalone");
    expect(manifest.display_override?.[0]).toBe("fullscreen");
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain(
      'apple-mobile-web-app-status-bar-style" content="black-translucent"',
    );
  });
});
