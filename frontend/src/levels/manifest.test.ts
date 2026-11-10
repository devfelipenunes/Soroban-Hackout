import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import deployments from "../../../deployments.json";
import manifest from "../../../levels.json";
import testsLib from "../../../contracts/tests/src/lib.rs?raw";
import testsLevels from "../../../contracts/tests/src/levels.rs?raw";
import workspaceToml from "../../../contracts/Cargo.toml?raw";
import { TOTAL as DIFFICULTY_SCALE } from "../components/Difficulty.tsx";
import { LEVELS, levelImage, loadBook, loadLevel, loadStory, loadNews } from "./index.ts";
import { type Narrative } from "./narrative.ts";
import { FINAL_AFTER, FINAL_SCENES } from "./epilogue.ts";
import type { BookChapter } from "./book.ts";
import type { CaseFile } from "./casefile.ts";
import type { CaseStory } from "./story.ts";
import { LANGUAGES } from "../i18n/translate.ts";

const SLUG = /^[a-z][a-z0-9]*$/;
const DIR = /^\d{2}-[a-z][a-z0-9]*$/;
const MODULE_LINE = /^mod (level_\d+);/gm;
const SPEC_ENTRY = /&crate::(level_\d+)::SPEC/g;
const SPEC_ID = /\bid:\s*(\d+)\s*,/;
const SPEC_SLUG = /\bslug:\s*"([^"]+)"/;

const instanceCrates = import.meta.glob("../../../contracts/levels/*/instance/Cargo.toml", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const validatorCrates = import.meta.glob("../../../contracts/levels/*/validator/Cargo.toml", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const levelTests = import.meta.glob("../../../contracts/tests/src/level_*.rs", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const instanceSources = import.meta.glob("../../../contracts/levels/*/instance/src/lib.rs", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const briefings = import.meta.glob("./briefings/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const conclusions = import.meta.glob("./conclusions/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const narratives = import.meta.glob("./narrative/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Narrative>;

const caseFiles = import.meta.glob("./casefile/*.json", {
  eager: true,
  import: "default",
}) as Record<string, CaseFile>;

const stories = import.meta.glob("./story/*.json", {
  eager: true,
  import: "default",
}) as Record<string, CaseStory>;

const books = import.meta.glob("./book/*.json", {
  eager: true,
  import: "default",
}) as Record<string, BookChapter>;

type Entry = (typeof manifest.levels)[number];

const pad = (id: number) => String(id).padStart(2, "0");
const dirName = (level: Entry) => `${pad(level.id)}-${level.slug}`;
const crateName = (level: Entry) => `breaker-level-${pad(level.id)}-${level.slug}`;
const moduleName = (level: Entry) => `level_${pad(level.id)}`;
const segment = (path: string, fromEnd: number) => path.split("/").at(-fromEnd);

const entries: Entry[] = manifest.levels;
const dirsOnDisk = Object.keys(instanceCrates).map((path) => segment(path, 3));
const declaredModules = [...testsLib.matchAll(MODULE_LINE)].map((match) => match[1]);
const harnessLevels = [...testsLevels.matchAll(SPEC_ENTRY)].map((match) => match[1]);

const textOf = (source: Record<string, string>, path: string) => {
  const text = source[path];
  if (text === undefined) throw new Error(`missing file: ${path}`);
  return text;
};

const CONTRACT_CALL = /window\.contract\.([a-z_]+)\s*\(/g;
const CONSOLE_BLOCK = /```js\b/g;

const sourceFor = (level: Entry): string | undefined => {
  const path = Object.keys(instanceSources).find((candidate) =>
    candidate.endsWith(`/${dirName(level)}/instance/src/lib.rs`),
  );
  return path === undefined ? undefined : instanceSources[path];
};

const signaturesOf = (source: string): Map<string, string[]> => {
  const signatures = new Map<string, string[]>();
  for (const match of source.matchAll(/pub fn ([a-z_]+)\s*\(([\s\S]*?)\)\s*(?:->[^{]*)?\{/g)) {
    const name = match[1];
    const parameters = match[2];
    if (name === undefined || parameters === undefined) continue;
    signatures.set(
      name,
      parameters
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .map((part) => part.split(":")[0]?.trim() ?? "")
        .filter((parameter) => parameter !== "" && parameter !== "env" && parameter !== "_env"),
    );
  }
  return signatures;
};

const closingParen = (text: string, start: number): number => {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    else if (char === ")") {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
};

const callsIn = (text: string, pattern: RegExp): { method: string; args: string }[] => {
  const calls: { method: string; args: string }[] = [];
  for (const match of text.matchAll(pattern)) {
    const method = match[1];
    if (method === undefined) continue;
    const start = (match.index ?? 0) + match[0].length;
    const end = closingParen(text, start);
    if (end < 0) continue;
    calls.push({ method, args: text.slice(start, end) });
  }
  return calls;
};

const argumentNames = (args: string): string[] | undefined => {
  const trimmed = args.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of trimmed.slice(1, -1)) {
    if ("{[(".includes(char)) depth += 1;
    else if ("}])".includes(char)) depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim() !== "") parts.push(current);
  return parts.map((part) => part.split(":")[0]?.trim() ?? "").filter((key) => key !== "");
};

describe("the manifest", () => {
  it("names each level with a one word slug", () => {
    for (const level of entries) {
      expect(level.slug, `level ${level.id}`).toMatch(SLUG);
    }
  });

  it("gives each level an id of its own", () => {
    const ids = entries.map((level) => level.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every id inside the two digits the paths are built from", () => {
    for (const level of entries) {
      expect(level.id, `level ${level.id}`).toBeGreaterThanOrEqual(0);
      expect(level.id, `level ${level.id} — the directory is ${pad(level.id)}-${level.slug}`)
        .toBeLessThan(100);
    }
  });

  it("gives each level a slug of its own", () => {
    const slugs = entries.map((level) => level.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("credits somebody", () => {
    for (const level of entries) {
      expect(level.author.trim(), `level ${level.id}`).not.toBe("");
    }
  });

  it("says revealCode as a boolean, not as something truthy", () => {
    for (const level of entries) {
      expect(typeof level.revealCode, `level ${level.id}`).toBe("boolean");
    }
  });

  it("calls nothing but the first level a tutorial", () => {
    for (const [position, level] of entries.entries()) {
      if (position === 0) continue;
      expect(level.difficulty, `level ${level.id} wears the tutorial label`).toBeGreaterThan(0);
    }
  });

  it("keeps the level the entry button points at", () => {
    expect(entries[0]?.id).toBe(0);
    expect(LEVELS[0]?.id).toBe(0);
  });

  it("keeps difficulty inside the scale the dots can draw", () => {
    for (const level of entries) {
      expect(Number.isInteger(level.difficulty), `level ${level.id}`).toBe(true);
      expect(level.difficulty, `level ${level.id}`).toBeGreaterThanOrEqual(0);
      expect(level.difficulty, `level ${level.id}`).toBeLessThanOrEqual(DIFFICULTY_SCALE);
    }
  });

  it("names every level in every language", () => {
    for (const level of entries) {
      for (const language of LANGUAGES) {
        expect(level.name[language], `level ${level.id} in ${language}`).toBeTruthy();
      }
    }
  });

  it("summarizes every level in every language", () => {
    for (const level of entries) {
      for (const language of LANGUAGES) {
        expect(
          level.summary[language]?.trim(),
          `level ${level.id} summary in ${language}`,
        ).toBeTruthy();
      }
    }
  });

  it("is the order the game presents", () => {
    expect(LEVELS.map((level) => level.id)).toEqual(entries.map((level) => level.id));
  });

  it("walks the levels in the order their ids go", () => {
    const ids = entries.map((level) => level.id);
    expect([...ids].sort((left, right) => left - right)).toEqual(ids);
  });
});

describe("the contracts", () => {
  it("has a directory on disk for every level, and nothing else", () => {
    expect([...dirsOnDisk].sort()).toEqual(entries.map(dirName).sort());
  });

  it("names each directory after its level", () => {
    for (const dir of dirsOnDisk) {
      expect(dir).toMatch(DIR);
    }
  });

  it("has both crates for every level", () => {
    for (const level of entries) {
      const dir = dirName(level);
      expect(Object.keys(instanceCrates), `${dir} instance`).toContain(
        `../../../contracts/levels/${dir}/instance/Cargo.toml`,
      );
      expect(Object.keys(validatorCrates), `${dir} validator`).toContain(
        `../../../contracts/levels/${dir}/validator/Cargo.toml`,
      );
    }
  });

  it("builds every crate the workspace claims to have", () => {
    for (const level of entries) {
      const dir = dirName(level);
      expect(workspaceToml, `${dir} instance`).toContain(`"levels/${dir}/instance"`);
      expect(workspaceToml, `${dir} validator`).toContain(`"levels/${dir}/validator"`);
    }
  });

  it("names every crate after the wasm artifact it produces", () => {
    for (const level of entries) {
      const dir = dirName(level);
      const base = `../../../contracts/levels/${dir}`;
      expect(textOf(instanceCrates, `${base}/instance/Cargo.toml`), `${dir} instance`).toContain(
        `name = "${crateName(level)}"`,
      );
      expect(textOf(validatorCrates, `${base}/validator/Cargo.toml`), `${dir} validator`).toContain(
        `name = "breaker-level-${pad(level.id)}-validator"`,
      );
    }
  });

  it("has a rust test module for every level", () => {
    expect(Object.keys(levelTests).map((path) => segment(path, 1)).sort()).toEqual(
      entries.map((level) => `${moduleName(level)}.rs`).sort(),
    );
  });

  it("compiles every test module, so none of them is silently skipped", () => {
    expect([...declaredModules].sort()).toEqual(
      entries.map((level) => moduleName(level)).sort(),
    );
  });

  it("puts every level in the world the tests build, in the order the manifest presents", () => {
    expect(harnessLevels).toEqual(entries.map((level) => moduleName(level)));
  });

  it("declares in its own module the id and the slug the manifest gives it", () => {
    for (const level of entries) {
      const module = moduleName(level);
      const source = textOf(levelTests, `../../../contracts/tests/src/${module}.rs`);

      expect(source.match(SPEC_ID)?.[1], `${module} SPEC.id`).toBe(String(level.id));
      expect(source.match(SPEC_SLUG)?.[1], `${module} SPEC.slug`).toBe(level.slug);
    }
  });
});

describe("the content", () => {
  it("has a briefing and a conclusion for every level, in every language", () => {
    for (const level of entries) {
      for (const language of LANGUAGES) {
        const name = `${pad(level.id)}.${language}.md`;
        expect(Object.keys(briefings), `briefing ${name}`).toContain(`./briefings/${name}`);
        expect(Object.keys(conclusions), `conclusion ${name}`).toContain(`./conclusions/${name}`);
      }
    }
  });

  it("writes a briefing that says which level it is", () => {
    for (const level of entries) {
      for (const language of LANGUAGES) {
        const text = textOf(briefings, `./briefings/${pad(level.id)}.${language}.md`);
        expect(text.trimStart(), `level ${level.id} in ${language}`).toMatch(/^#\s+\S/);
        expect(text.toLowerCase(), `level ${level.id} in ${language}`).toContain(
          level.name[language]!.toLowerCase(),
        );
      }
    }
  });

  it("writes a conclusion that says something", () => {
    for (const level of entries) {
      for (const language of LANGUAGES) {
        const text = textOf(conclusions, `./conclusions/${pad(level.id)}.${language}.md`);
        expect(text.trimStart(), `level ${level.id} in ${language}`).toMatch(/^#{1,2}\s+\S/);
        expect(text.trim().length, `level ${level.id} in ${language}`).toBeGreaterThan(80);
      }
    }
  });

  it("reaches the player with both texts and a source for every level", async () => {
    for (const level of LEVELS) {
      const content = await loadLevel(level);

      expect(content.missing, `level ${level.id} is missing files`).toEqual([]);

      for (const language of LANGUAGES) {
        expect(content.statement[language], `level ${level.id} statement in ${language}`).toBeTruthy();
        expect(content.conclusion[language], `level ${level.id} conclusion in ${language}`).toBeTruthy();
      }

      expect(content.source, `level ${level.id} source`).toContain("fn ");
    }
  });

  it("reports a level file it cannot load instead of taking the site down with it", async () => {
    const content = await loadLevel(LEVELS[0]!, {
      briefings: {},
      conclusions: {
        "./conclusions/00.pt-BR.md": () => Promise.reject(new Error("the file is broken")),
      },
      sources: {},
    });

    expect(content.missing.length).toBeGreaterThan(0);
    expect(content.statement).toEqual({});
    expect(content.source).toBe("");
  });
});

describe("the call examples", () => {
  const NOTE = {
    "pt-BR": "Métodos com argumentos recebem um objeto com os argumentos nomeados; `window.help()` lista os nomes deste caso.",
    en: "Methods with arguments take one object of named arguments; `window.help()` lists this case's names.",
    es: "Los métodos con argumentos reciben un único objeto con argumentos nombrados; `window.help()` muestra los nombres disponibles en este caso.",
  } as const;

  const HEADING = {
    "pt-BR": "## O que fazer",
    en: "## What to do",
    es: "## Qué hacer",
  } as const;

  const CLOSING = {
    "pt-BR": /clique em \*\*Submeter\*\*\.\s*$/,
    en: /click \*\*Submit\*\*\.\s*$/,
    es: /\*\*Enviar\*\*\./,
  } as const;

  const parametersOf = (level: Entry, method: string): string[] | undefined =>
    signaturesOf(sourceFor(level) ?? "").get(method);

  const expectCompleteCall = (level: Entry, method: string, args: string, where: string) => {
    const parameters = parametersOf(level, method);
    if (parameters === undefined) return;

    if (args.trim() === "") {
      expect(parameters, `${where} calls ${method} with no arguments`).toEqual([]);
      return;
    }

    const names = argumentNames(args);
    expect(
      names,
      `${where} calls ${method} positionally; arguments go by name in one object`,
    ).toBeDefined();
    if (names === undefined) return;

    expect([...names].sort(), `${where} calls ${method} with the wrong field names`).toEqual(
      [...parameters].sort(),
    );
  };

  const proseOf = (level: Entry, language: (typeof LANGUAGES)[number]): string[] => {
    const id = pad(level.id);
    return [
      textOf(briefings, `./briefings/${id}.${language}.md`),
      textOf(conclusions, `./conclusions/${id}.${language}.md`),
      JSON.stringify(narratives[`./narrative/${id}.json`] ?? ""),
      JSON.stringify(caseFiles[`./casefile/${id}.json`] ?? ""),
      JSON.stringify(stories[`./story/${id}.json`] ?? ""),
      JSON.stringify(books[`./book/${id}.json`] ?? ""),
    ];
  };

  it("writes every console call with the arguments the instance declares", () => {
    for (const level of entries) {
      for (const language of LANGUAGES) {
        const text = textOf(briefings, `./briefings/${pad(level.id)}.${language}.md`);
        for (const call of callsIn(text, CONTRACT_CALL)) {
          expect(
            parametersOf(level, call.method),
            `level ${level.id} briefing in ${language} calls ${call.method}, which the instance does not expose`,
          ).toBeDefined();
          expectCompleteCall(
            level,
            call.method,
            call.args,
            `level ${level.id} briefing in ${language}`,
          );
        }
      }
    }
  });

  it("keeps every prose reference bare or as a complete call", () => {
    for (const level of entries) {
      const names = [...signaturesOf(sourceFor(level) ?? "").keys()];
      const reference = new RegExp(`\\b(${names.join("|")})\\s*\\(`, "g");
      for (const language of LANGUAGES) {
        for (const text of proseOf(level, language)) {
          for (const call of callsIn(text, reference)) {
            expectCompleteCall(
              level,
              call.method,
              call.args,
              `level ${level.id} prose in ${language}`,
            );
          }
        }
      }
    }
  });

  it("gives every briefing the same section heading", () => {
    for (const level of entries) {
      for (const language of LANGUAGES) {
        const text = textOf(briefings, `./briefings/${pad(level.id)}.${language}.md`);
        expect(
          [...text.matchAll(/^## .+$/gm)].map((match) => match[0]),
          `level ${level.id} in ${language}`,
        ).toEqual([HEADING[language]]);
      }
    }
  });

  it("gives every briefing exactly one console block", () => {
    for (const level of entries) {
      for (const language of LANGUAGES) {
        const text = textOf(briefings, `./briefings/${pad(level.id)}.${language}.md`);
        expect(
          [...text.matchAll(CONSOLE_BLOCK)].length,
          `level ${level.id} in ${language}`,
        ).toBe(1);
      }
    }
  });

  it("carries the named-argument note in every language", () => {
    for (const level of entries) {
      for (const language of LANGUAGES) {
        const text = textOf(briefings, `./briefings/${pad(level.id)}.${language}.md`);
        expect(text, `level ${level.id} in ${language}`).toContain(NOTE[language]);
      }
    }
  });

  it("closes every briefing on the submit instruction", () => {
    for (const level of entries) {
      for (const language of LANGUAGES) {
        const text = textOf(briefings, `./briefings/${pad(level.id)}.${language}.md`);
        expect(text, `level ${level.id} in ${language}`).toMatch(CLOSING[language]);
      }
    }
  });

  it("mentions the auxiliary contract exactly where the level has one", () => {
    for (const level of entries) {
      for (const language of LANGUAGES) {
        const text = textOf(briefings, `./briefings/${pad(level.id)}.${language}.md`);
        expect(text.includes("window.aux"), `level ${level.id} in ${language}`).toBe(
          level.aux !== null && level.aux !== undefined,
        );
      }
    }
  });
});

describe("the season narrative", () => {
  const TRIGGER = /^(start|previous-solved|instance|first-call|rejected|stuck|ledger-ready|solved|call:[a-z_]+)$/;
  const SPEAKERS = ["mara", "breaker", "system", "custodian", "voss", "architect"];

  const sourceOf = (level: Entry): string | undefined => {
    const path = Object.keys(instanceSources).find((candidate) =>
      candidate.endsWith(`/${dirName(level)}/instance/src/lib.rs`),
    );
    return path === undefined ? undefined : instanceSources[path];
  };

  const methodsOf = (source: string): Set<string> =>
    new Set(
      [...source.matchAll(/pub fn ([a-z_]+)\s*\(/g)]
        .map((match) => match[1])
        .filter((name): name is string => name !== undefined),
    );

  it("has a file for every level in the manifest", () => {
    for (const level of entries) {
      expect(Object.keys(narratives), `level ${level.id}`).toContain(
        `./narrative/${pad(level.id)}.json`,
      );
    }
  });

  it("writes every beat and evidence item in every language", () => {
    for (const [path, narrative] of Object.entries(narratives)) {
      expect(narrative.beats.length, path).toBeGreaterThan(0);

      const triggers = new Set(narrative.beats.map((beat) => beat.trigger));
      expect(triggers.has("start"), `${path} has a start beat`).toBe(true);
      expect(triggers.has("solved"), `${path} has a solved beat`).toBe(true);

      for (const beat of narrative.beats) {
        expect(beat.trigger, path).toMatch(TRIGGER);
        expect(SPEAKERS, `${path} speaker`).toContain(beat.speaker);
        for (const language of LANGUAGES) {
          expect(beat.text[language]?.trim(), `${path} beat in ${language}`).toBeTruthy();
        }
      }

      const ids = narrative.evidence.map((item) => item.id);
      expect(new Set(ids).size, path).toBe(ids.length);

      for (const item of narrative.evidence) {
        expect(item.reveal, path).toMatch(TRIGGER);
        for (const language of LANGUAGES) {
          expect(
            item.label[language]?.trim(),
            `${path} ${item.id} label in ${language}`,
          ).toBeTruthy();
          expect(
            item.value[language]?.trim(),
            `${path} ${item.id} value in ${language}`,
          ).toBeTruthy();
        }
      }
    }
  });

  it("only triggers calls that the instance actually exposes", () => {
    for (const level of entries) {
      const narrative = narratives[`./narrative/${pad(level.id)}.json`];
      const source = sourceOf(level);

      expect(narrative, `level ${level.id}`).toBeDefined();
      expect(source, `level ${level.id} source`).toBeDefined();
      if (narrative === undefined || source === undefined) continue;

      const methods = methodsOf(source);
      const triggers = [
        ...narrative.beats.map((beat) => beat.trigger),
        ...narrative.evidence.map((item) => item.reveal),
      ];

      for (const trigger of triggers) {
        if (!trigger.startsWith("call:")) continue;
        const method = trigger.slice("call:".length);
        expect(methods, `level ${level.id} triggers call:${method}`).toContain(method);
      }
    }
  });

  it("gives every level three hints in every language", () => {
    for (const [path, narrative] of Object.entries(narratives)) {
      expect(narrative.hints?.length, path).toBe(3);

      for (const hint of narrative.hints ?? []) {
        for (const language of LANGUAGES) {
          expect(hint[language]?.trim(), `${path} hint in ${language}`).toBeTruthy();
        }
      }
    }
  });

  it("keeps the campaign linear and links evidence to documents in every language", () => {
    for (const [path, narrative] of Object.entries(narratives)) {
      expect(narrative.choices ?? [], path).toEqual([]);
      expect(narrative.replies ?? [], path).toEqual([]);
      const documents = narrative.documents ?? [];
      expect(documents.length, path).toBeGreaterThanOrEqual(2);
      expect(new Set(documents.map((document) => document.id)).size, path).toBe(documents.length);
      for (const item of narrative.evidence) {
        if (item.documentId) expect(documents.some((document) => document.id === item.documentId && document.reveal === item.reveal), path).toBe(true);
      }
      for (const document of documents) {
        expect(document.reveal, path).toMatch(TRIGGER);
        for (const lang of LANGUAGES) {
          expect(document.title[lang]?.trim(), path).toBeTruthy();
          expect(document.source[lang]?.trim(), path).toBeTruthy();
          for (const paragraph of document.body) expect(paragraph[lang]?.trim(), path).toBeTruthy();
        }
      }
    }
  });

  it("loads every narrative through loadLevel", async () => {
    for (const level of entries) {
      const content = await loadLevel(level);
      expect(content.narrative, `level ${level.id}`).not.toBeNull();
      expect(content.narrative?.beats.length, `level ${level.id}`).toBeGreaterThan(0);
    }
  });
});

describe("the case file and the long-form story", () => {
  it("has a case file and a story for every level", () => {
    for (const level of entries) {
      expect(Object.keys(caseFiles), `level ${level.id}`).toContain(
        `./casefile/${pad(level.id)}.json`,
      );
      expect(Object.keys(stories), `level ${level.id}`).toContain(
        `./story/${pad(level.id)}.json`,
      );
    }
  });

  it("writes the case file in every language, with known, unknown and reading", () => {
    for (const [path, caseFile] of Object.entries(caseFiles)) {
      for (const language of LANGUAGES) {
        expect(caseFile.objective[language]?.trim(), `${path} objective in ${language}`).toBeTruthy();
        expect(caseFile.target[language]?.trim(), `${path} target in ${language}`).toBeTruthy();
        expect(caseFile.owner[language]?.trim(), `${path} owner in ${language}`).toBeTruthy();
        expect(caseFile.network[language]?.trim(), `${path} network in ${language}`).toBeTruthy();
        expect(caseFile.lead?.[language]?.trim(), `${path} lead in ${language}`).toBeTruthy();
      }

      expect(caseFile.known.length, path).toBeGreaterThan(0);
      expect(caseFile.unknown.length, path).toBeGreaterThan(0);
      expect(caseFile.reading.length, path).toBeGreaterThan(0);

      for (const list of [caseFile.known, caseFile.unknown, caseFile.reading]) {
        for (const item of list) {
          for (const language of LANGUAGES) {
            expect(item[language]?.trim(), `${path} item in ${language}`).toBeTruthy();
          }
        }
      }
    }
  });

  it("writes the long-form story in every language, with scenes", () => {
    for (const [path, story] of Object.entries(stories)) {
      expect(story.scenes.length, path).toBeGreaterThan(0);

      for (const scene of story.scenes) {
        for (const language of LANGUAGES) {
          expect(scene.title[language]?.trim(), `${path} ${scene.id} title in ${language}`).toBeTruthy();
        }

        expect(scene.paragraphs.length, `${path} ${scene.id}`).toBeGreaterThan(0);

        for (const paragraph of scene.paragraphs) {
          for (const language of LANGUAGES) {
            expect(
              paragraph[language]?.trim(),
              `${path} ${scene.id} paragraph in ${language}`,
            ).toBeTruthy();
          }
        }
      }
    }
  });

  it("keeps every long-form story to at least four scenes", () => {
    for (const [path, story] of Object.entries(stories)) {
      expect(story.scenes.length, path).toBeGreaterThanOrEqual(4);
    }
  });

  it("loads the case file and the story through the runtime loaders", async () => {
    for (const level of entries) {
      const content = await loadLevel(level);
      expect(content.caseFile, `level ${level.id} case file`).not.toBeNull();

      const story = await loadStory(level.id);
      expect(story, `level ${level.id} story`).not.toBeNull();
      expect(story?.scenes.length, `level ${level.id}`).toBeGreaterThan(0);
    }
  });
});

describe("the book layer", () => {
  it("has a chapter for every level", () => {
    for (const level of entries) {
      expect(Object.keys(books), `level ${level.id}`).toContain(
        `./book/${pad(level.id)}.json`,
      );
    }
  });

  it("writes the title and every page in every language", () => {
    for (const [path, chapter] of Object.entries(books)) {
      for (const language of LANGUAGES) {
        expect(chapter.title[language]?.trim(), `${path} title in ${language}`).toBeTruthy();
      }

      expect(chapter.pages.length, path).toBeGreaterThan(0);

      for (const page of chapter.pages) {
        expect(page.paragraphs.length, path).toBeGreaterThan(0);

        for (const paragraph of page.paragraphs) {
          for (const language of LANGUAGES) {
            expect(
              paragraph[language]?.trim(),
              `${path} paragraph in ${language}`,
            ).toBeTruthy();
          }
        }
      }
    }
  });

  it("separates each opening from its outcome without dialogue choices", () => {
    for (const [path, chapter] of Object.entries(books)) {
      expect(chapter.choice, path).toBeUndefined();
      expect(chapter.openingCount, path).toBeGreaterThan(0);
      expect(chapter.openingCount, path).toBe(chapter.pages.length);
      expect(chapter.continuation?.paragraphs.length, path).toBeGreaterThan(0);
    }
  });

  it("loads every chapter through the runtime loader", async () => {
    for (const level of entries) {
      const chapter = await loadBook(level.id);
      expect(chapter, `level ${level.id}`).not.toBeNull();
      expect(chapter?.pages.length, `level ${level.id}`).toBeGreaterThan(0);
    }
  });
});

describe("the final sequence", () => {
  const scenes = [...FINAL_SCENES, ...FINAL_AFTER];

  it("writes every scene and line in every language", () => {
    expect(scenes.length).toBeGreaterThan(0);

    for (const scene of scenes) {
      for (const language of LANGUAGES) {
        expect(scene.title[language]?.trim(), `${scene.id} title in ${language}`).toBeTruthy();
      }

      expect(scene.lines.length, scene.id).toBeGreaterThan(0);

      for (const line of scene.lines) {
        for (const language of LANGUAGES) {
          expect(line.text[language]?.trim(), `${scene.id} line in ${language}`).toBeTruthy();
        }
      }
    }
  });

  it("closes the season with the same epilogue", () => {
    const closing = FINAL_AFTER[FINAL_AFTER.length - 1];
    expect(closing, "the sequence has an epilogue").toBeDefined();
    expect(
      closing?.lines.some((line) => line.text["pt-BR"].includes("END OF SEQUENCE 01")),
    ).toBe(true);
  });
});

describe("the season art", () => {
  const seasonDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/images/levels");

  it("has the homepage art", () => {
    expect(existsSync(resolve(seasonDir, "homepage.webp")), "homepage.webp").toBe(true);
  });

  it("has the art for every level", () => {
    for (const level of entries) {
      const file = basename(levelImage(level.id));
      expect(existsSync(resolve(seasonDir, file)), file).toBe(true);
    }
  });

  it("has the deferred art the homepage teases", () => {
    for (const file of ["11.webp", "12.webp"]) {
      expect(existsSync(resolve(seasonDir, file)), file).toBe(true);
    }
  });
});

describe("the deployed record", () => {
  it("registers nothing the manifest does not know about", () => {
    const registered = Object.keys(
      (deployments as { levels?: Record<string, unknown> }).levels ?? {},
    );
    const known = entries.map((level) => String(level.id));
    for (const id of registered) {
      expect(known, `deployed level ${id}`).toContain(id);
    }
  });
});


describe("the linear campaign transmissions", () => {
  it("defers every previous-case record until confirmed completion", () => {
    for (const level of entries) {
      const narrative = narratives[`./narrative/${pad(level.id)}.json`];
      expect(narrative).toBeDefined();
      if (!narrative) continue;
      const previous = narrative.documents?.filter((document) => document.id.endsWith("previous-record")) ?? [];
      expect(previous.length, `case ${level.id}`).toBe(level.id === 0 ? 0 : 1);
      for (const document of previous) expect(document.reveal).toBe("previous-solved");
      expect(narrative.beats.filter((beat) => beat.trigger === "solved").every((beat) => beat.speaker === "system"), `case ${level.id} has no premature dialogue outcome`).toBe(true);
    }
  });
});


describe("Network Wire", () => {
  it("opens the canonical prologue publication instead of inventing later appearances", async () => {
    const article = await loadNews();
    expect(article?.id).toBe("00-document-1");
    expect(article?.source["pt-BR"]).toBe("Sera Quill — Network Wire");
    expect(article?.title["pt-BR"]).toContain("2,4 milhões");
    expect(article?.title.en).toContain("2.4 million");
    expect(article?.reveal).toBe("start");
    expect(article?.body.length).toBeGreaterThan(0);
  });
});
