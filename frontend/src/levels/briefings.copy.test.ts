import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const briefing = (level: string, language: string): string =>
  readFileSync(resolve(HERE, "briefings", `${level}.${language}.md`), "utf8");
const LANGUAGES = ["pt-BR", "en", "es"];

describe("briefing copy", () => {
  it("gives the prologue amount a unit, in every language", () => {
    for (const language of LANGUAGES) {
      expect(briefing("00", language)).toMatch(/XLM/);
    }
  });

  it("announces window.protocolKey() on the levels whose contract derives the key", () => {
    for (const level of ["11", "12"]) {
      for (const language of LANGUAGES) {
        expect(briefing(level, language)).toContain("window.protocolKey()");
      }
    }
  });
});
