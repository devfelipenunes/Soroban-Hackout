import manifest from "../../../levels.json";
import { LANGUAGES, type Language } from "../i18n/translate.ts";
import type { BookChapter } from "./book.ts";
import type { CaseFile } from "./casefile.ts";
import type { Narrative, NarrativeDocument } from "./narrative.ts";
import type { CaseStory } from "./story.ts";

type Loader = () => Promise<string>;

const briefings = import.meta.glob("./briefings/*.md", {
  query: "?raw",
  import: "default",
}) as Record<string, Loader>;

const conclusions = import.meta.glob("./conclusions/*.md", {
  query: "?raw",
  import: "default",
}) as Record<string, Loader>;

const sources = import.meta.glob("../../../contracts/levels/*/instance/src/lib.rs", {
  query: "?raw",
  import: "default",
}) as Record<string, Loader>;

const narratives = import.meta.glob("./narrative/*.json", {
  import: "default",
}) as Record<string, () => Promise<Narrative>>;

const caseFiles = import.meta.glob("./casefile/*.json", {
  import: "default",
}) as Record<string, () => Promise<CaseFile>>;

const stories = import.meta.glob("./story/*.json", {
  import: "default",
}) as Record<string, () => Promise<CaseStory>>;

const books = import.meta.glob("./book/*.json", {
  import: "default",
}) as Record<string, () => Promise<BookChapter>>;

export type LevelTexts = Partial<Record<Language, string>>;

export type Level = {
  id: number;
  slug: string;
  name: LevelTexts;
  summary: LevelTexts;
  difficulty: number;
  author: string;
  revealCode: boolean;
  aux?: string | undefined;
};

export type LevelContent = {
  statement: LevelTexts;
  conclusion: LevelTexts;
  source: string;
  narrative: Narrative | null;
  caseFile: CaseFile | null;
  missing: readonly string[];
};

const pad = (id: number) => String(id).padStart(2, "0");

export const HOMEPAGE_IMAGE = "/images/levels/homepage.webp";

const optimizedCovers = new Set([2, 3, 4, 6, 7]);

export const levelImage = (id: number): string =>
  `/images/levels/${pad(id)}${optimizedCovers.has(id) ? "-cover.webp" : ".webp"}`;

export const levelCode = (id: number): string => {
  if (id === 5) return "B1";
  return id > 5 ? pad(id - 1) : pad(id);
};

export const LEVELS: readonly Level[] = manifest.levels.map((entry) => ({
  id: entry.id,
  slug: entry.slug,
  name: entry.name,
  summary: entry.summary,
  difficulty: entry.difficulty,
  author: entry.author,
  revealCode: entry.revealCode,
  aux: "aux" in entry ? entry.aux : undefined,
}));

async function read(
  files: Record<string, Loader>,
  path: string,
  missing: string[],
): Promise<string | null> {
  const load = files[path];

  if (load === undefined) {
    missing.push(path);
    return null;
  }

  try {
    return await load();
  } catch {
    missing.push(path);
    return null;
  }
}

export type LevelFiles = {
  briefings: Record<string, Loader>;
  conclusions: Record<string, Loader>;
  sources: Record<string, Loader>;
  narratives?: Record<string, () => Promise<Narrative>>;
  caseFiles?: Record<string, () => Promise<CaseFile>>;
};

const FILES: LevelFiles = { briefings, conclusions, sources, narratives, caseFiles };

async function readNarrative(
  files: Record<string, () => Promise<Narrative>>,
  path: string,
): Promise<Narrative | null> {
  const load = files[path];
  if (load === undefined) return null;

  try {
    return await load();
  } catch {
    return null;
  }
}


export async function loadNarrative(levelId: number): Promise<Narrative | null> {
  return readNarrative(narratives, `./narrative/${pad(levelId)}.json`);
}

async function readCaseFile(
  files: Record<string, () => Promise<CaseFile>>,
  path: string,
): Promise<CaseFile | null> {
  const load = files[path];
  if (load === undefined) return null;

  try {
    return await load();
  } catch {
    return null;
  }
}

export async function loadLevel(level: Level, files: LevelFiles = FILES): Promise<LevelContent> {
  const missing: string[] = [];
  const statement: LevelTexts = {};
  const conclusion: LevelTexts = {};
  const [localized, source, narrative, caseFile] = await Promise.all([
    Promise.all(LANGUAGES.map(async (language) => {
      const [text, ending] = await Promise.all([
        read(files.briefings, `./briefings/${pad(level.id)}.${language}.md`, missing),
        read(files.conclusions, `./conclusions/${pad(level.id)}.${language}.md`, missing),
      ]);
      return { language, text, ending };
    })),
    read(
      files.sources,
      `../../../contracts/levels/${pad(level.id)}-${level.slug}/instance/src/lib.rs`,
      missing,
    ),
    readNarrative(files.narratives ?? {}, `./narrative/${pad(level.id)}.json`),
    readCaseFile(files.caseFiles ?? {}, `./casefile/${pad(level.id)}.json`),
  ]);

  for (const entry of localized) {
    if (entry.text !== null) statement[entry.language] = entry.text;
    if (entry.ending !== null) conclusion[entry.language] = entry.ending;
  }

  return {
    statement,
    conclusion,
    source: typeof source === "string" ? source : "",
    narrative,
    caseFile,
    missing,
  };
}

export async function loadStory(
  levelId: number,
  files: Record<string, () => Promise<CaseStory>> = stories,
): Promise<CaseStory | null> {
  const load = files[`./story/${pad(levelId)}.json`];
  if (load === undefined) return null;

  try {
    return await load();
  } catch {
    return null;
  }
}

export async function loadNews(levelId = 0): Promise<NarrativeDocument | null> {
  const key = `./narrative/${pad(levelId)}.json`;
  const narrative = await readNarrative(narratives, key);
  if (!narrative?.documents?.length) return null;
  const preferred = levelId === 0
    ? narrative.documents.find((document) => document.id === "00-document-1")
    : narrative.documents.find((document) => document.id.endsWith("-document-0"));
  return preferred ?? narrative.documents[0] ?? null;
}

export async function loadBook(
  levelId: number,
  files: Record<string, () => Promise<BookChapter>> = books,
): Promise<BookChapter | null> {
  const load = files[`./book/${pad(levelId)}.json`];
  if (load === undefined) return null;

  try {
    return await load();
  } catch {
    return null;
  }
}

export type Choice = {
  text: string;
  missing: boolean;
};

export function choose(texts: LevelTexts, language: Language): Choice | null {
  const own = texts[language];
  if (own !== undefined) return { text: own, missing: false };

  const fallback = texts["pt-BR"];
  if (fallback !== undefined) return { text: fallback, missing: true };

  return null;
}

export function levelById(id: number): Level | undefined {
  return LEVELS.find((n) => n.id === id);
}
