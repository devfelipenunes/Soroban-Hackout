import type { Tone } from "./narrative.ts";
import type { LocalizedText } from "./text.ts";

export type BookPage = {
  readonly paragraphs: readonly LocalizedText[];
};

export type BookChoiceOption = {
  readonly tone: Tone;
  readonly label: LocalizedText;
  readonly response: LocalizedText;
};

export type BookChoice = {
  readonly prompt: LocalizedText;
  readonly options: readonly BookChoiceOption[];
};

export type BookChapter = {
  readonly title: LocalizedText;
  readonly pages: readonly BookPage[];
  readonly openingCount?: number;
  readonly continuation?: BookPage;
  readonly choice?: BookChoice;
};

const MIN_CHARACTERS_PER_PAGE = 400;
const PREFERRED_CHARACTERS_PER_PAGE = 650;
const MAX_CHARACTERS_PER_PAGE = 850;

function paragraphLength(paragraph: LocalizedText): number {
  return Math.max(paragraph["pt-BR"].length, paragraph.en.length);
}


export function paginateBookPages(pages: readonly BookPage[]): readonly BookPage[] {
  const chunks: LocalizedText[][] = [];
  let paragraphs: LocalizedText[] = [];
  let characters = 0;

  for (const paragraph of pages.flatMap((page) => page.paragraphs)) {
    const length = paragraphLength(paragraph);
    const exceedsPreferred = characters >= MIN_CHARACTERS_PER_PAGE &&
      characters + length > PREFERRED_CHARACTERS_PER_PAGE;
    const exceedsMaximum = characters > 0 && characters + length > MAX_CHARACTERS_PER_PAGE;

    if (paragraphs.length > 0 && (exceedsPreferred || exceedsMaximum)) {
      chunks.push(paragraphs);
      paragraphs = [];
      characters = 0;
    }

    paragraphs.push(paragraph);
    characters += length;
  }

  if (paragraphs.length > 0) chunks.push(paragraphs);

  const last = chunks.at(-1);
  const previous = chunks.at(-2);
  if (last !== undefined && previous !== undefined) {
    let lastLength = last.reduce((total, paragraph) => total + paragraphLength(paragraph), 0);
    let previousLength = previous.reduce((total, paragraph) => total + paragraphLength(paragraph), 0);

    while (lastLength < MIN_CHARACTERS_PER_PAGE && previous.length > 1) {
      const paragraph = previous.at(-1);
      if (paragraph === undefined) break;

      const length = paragraphLength(paragraph);
      if (previousLength - length < MIN_CHARACTERS_PER_PAGE) break;

      previous.pop();
      last.unshift(paragraph);
      previousLength -= length;
      lastLength += length;
    }
  }

  return chunks.map((chunk) => ({ paragraphs: chunk }));
}


export function openingPages(chapter: BookChapter | null): readonly BookPage[] {
  return chapter?.openingCount === undefined ? [] : chapter.pages.slice(0, chapter.openingCount);
}

export function continuationPages(chapter: BookChapter | null, completed: boolean): readonly BookPage[] {
  if (!completed || chapter?.openingCount === undefined) return [];
  return chapter.continuation ? [chapter.continuation] : chapter.pages.slice(chapter.openingCount);
}
