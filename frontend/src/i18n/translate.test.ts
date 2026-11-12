import { describe, expect, it } from "vitest";

import { TEXTS as GAME_TEXTS } from "./texts.ts";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  detectLanguage,
  isLanguage,
  languageCode,
  nextLanguage,
  translate,
  type Texts,
} from "./translate.ts";

const TEXTS: Texts = {
  "pt-BR": {
    hello: "Olá",
    onlyInDefault: "Só existe em português",
    withVars: "Nível {n} de {total}",
  },
  en: {
    hello: "Hello",
    withVars: "Level {n} of {total}",
  },
  es: {
    hello: "Hola",
    withVars: "Nivel {n} de {total}",
  },
};

describe("translate", () => {
  it("uses the requested language's dictionary when the key exists", () => {
    expect(translate(TEXTS, "en", "hello")).toBe("Hello");
    expect(translate(TEXTS, "pt-BR", "hello")).toBe("Olá");
  });

  it("falls back to the default language when the translation is missing", () => {
    expect(translate(TEXTS, "en", "onlyInDefault")).toBe("Só existe em português");
  });

  it("shows the key between marks when it exists nowhere", () => {
    expect(translate(TEXTS, "en", "nowhereAtAll")).toBe("⟨nowhereAtAll⟩");
    expect(translate(TEXTS, "pt-BR", "nowhereAtAll")).toBe("⟨nowhereAtAll⟩");
  });

  it("substitutes the variables, and leaves untouched what was not passed", () => {
    expect(translate(TEXTS, "pt-BR", "withVars", { n: 3, total: 9 })).toBe("Nível 3 de 9");
    expect(translate(TEXTS, "en", "withVars", { n: 3 })).toBe("Level 3 of {total}");
  });

  it("does not confuse a variable named like something inherited from Object", () => {
    expect(translate(TEXTS, "pt-BR", "withVars", { n: 1 })).toBe("Nível 1 de {total}");
  });
});

describe("detectLanguage", () => {
  it("recognises English and Spanish and treats other languages as Portuguese", () => {
    expect(detectLanguage("en-US")).toBe("en");
    expect(detectLanguage("en")).toBe("en");
    expect(detectLanguage("es-MX")).toBe("es");
    expect(detectLanguage("es")).toBe("es");
    expect(detectLanguage("pt-BR")).toBe(DEFAULT_LANGUAGE);
    expect(detectLanguage("pt-PT")).toBe(DEFAULT_LANGUAGE);
    expect(detectLanguage("de-DE")).toBe(DEFAULT_LANGUAGE);
  });

  it("does not break when there is no browser", () => {
    expect(detectLanguage("")).toBe(DEFAULT_LANGUAGE);
  });
});

describe("isLanguage", () => {
  it("accepts only the languages that exist", () => {
    expect(isLanguage("pt-BR")).toBe(true);
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("es")).toBe(true);
    expect(isLanguage("fr")).toBe(false);
    expect(isLanguage(null)).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });
});

describe("language selector", () => {
  it("cycles through Portuguese, English, and Spanish", () => {
    expect(nextLanguage("pt-BR")).toBe("en");
    expect(nextLanguage("en")).toBe("es");
    expect(nextLanguage("es")).toBe("pt-BR");
  });

  it("shows the locale code for each language", () => {
    expect(languageCode("pt-BR")).toBe("PT");
    expect(languageCode("en")).toBe("EN");
    expect(languageCode("es")).toBe("ES");
  });
});

const SOURCES = import.meta.glob("../**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const CALL = /\bt\(\s*"([^"]+)"/g;
const CALL_WITH_VARS = /\bt\(\s*"([^"]+)"\s*,\s*\{([^}]*)\}/g;
const VAR_NAME = /([A-Za-z_$][\w$]*)\s*:/g;

describe("the dictionary and its callers", () => {
  it("has the same keys in every supported language", () => {
    const missing = LANGUAGES.filter((language) => language !== DEFAULT_LANGUAGE).flatMap(
      (language) =>
        Object.keys(GAME_TEXTS[DEFAULT_LANGUAGE])
          .filter((key) => GAME_TEXTS[language][key] === undefined)
          .map((key) => `${language} is missing ${key}`),
    );

    expect(missing).toEqual([]);
  });

  it("only asks for keys that the dictionary defines", () => {
    const unknown: string[] = [];

    for (const [file, source] of Object.entries(SOURCES)) {
      for (const call of source.matchAll(CALL)) {
        const key = call[1] ?? "";

        if (GAME_TEXTS[DEFAULT_LANGUAGE][key] === undefined) {
          unknown.push(`${file}: t("${key}") is defined nowhere`);
        }
      }
    }

    expect(unknown).toEqual([]);
  });

  it("passes the variables that the texts actually spell out", () => {
    const wrong: string[] = [];

    for (const [file, source] of Object.entries(SOURCES)) {
      for (const call of source.matchAll(CALL_WITH_VARS)) {
        const key = call[1] ?? "";
        const body = call[2] ?? "";

        for (const passed of body.matchAll(VAR_NAME)) {
          const name = passed[1] ?? "";

          for (const language of LANGUAGES) {
            const text = GAME_TEXTS[language][key];

            if (text !== undefined && !text.includes(`{${name}}`)) {
              wrong.push(`${file}: t("${key}", { ${name} }) — ${language} spells no {${name}}`);
            }
          }
        }
      }
    }

    expect(wrong).toEqual([]);
  });
});
