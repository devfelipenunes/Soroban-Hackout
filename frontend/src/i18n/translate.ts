export type Language = "pt-BR" | "en" | "es";

export const LANGUAGES = ["pt-BR", "en", "es"] as const;

export const DEFAULT_LANGUAGE: Language = "pt-BR";

export function nextLanguage(language: Language): Language {
  const index = LANGUAGES.indexOf(language);
  return LANGUAGES[(index + 1) % LANGUAGES.length] ?? DEFAULT_LANGUAGE;
}

export function languageCode(language: Language): string {
  return language === "pt-BR" ? "PT" : language.toUpperCase();
}

export type Dictionary = Readonly<Record<string, string>>;

export type Texts = Readonly<Record<Language, Dictionary>>;

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

export function translate(
  texts: Texts,
  language: Language,
  key: string,
  vars?: Readonly<Record<string, string | number>>,
): string {
  const raw =
    texts[language][key] ?? texts[DEFAULT_LANGUAGE][key] ?? `⟨${key}⟩`;

  if (!vars) return raw;

  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match,
  );
}

export function detectLanguage(browser?: string): Language {
  const raw = browser ?? (typeof navigator === "undefined" ? "" : navigator.language);
  const normalized = raw.toLowerCase();
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("es")) return "es";
  return DEFAULT_LANGUAGE;
}
