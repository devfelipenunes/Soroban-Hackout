import { describe, expect, it } from "vitest";
import { FINAL_AFTER, FINAL_SCENES } from "./epilogue.ts";
import { openingPages, continuationPages, paginateBookPages, type BookChapter } from "./book.ts";

const text = (value: string) => ({ "pt-BR": value, en: value, es: value });
const all = [...FINAL_SCENES, ...FINAL_AFTER];
const prose = all.flatMap((scene) => [...scene.lines.map((line) => line.text["pt-BR"]), ...(scene.terminal ?? [])]).join("\n");

describe("spoiler boundaries", () => {
  const opening = { paragraphs: [text("unanswered question")] };
  const outcome = { paragraphs: [text("secret outcome")] };
  const chapter: BookChapter = { title: text("case"), pages: [opening, outcome], openingCount: 1 };
  it("never sends the outcome to the current opening", () => {
    expect(openingPages(chapter)).toEqual([opening]);
    expect(openingPages(chapter)).not.toContain(outcome);
  });
  it("requires confirmed completion even when chapter data has been loaded", () => {
    expect(continuationPages(chapter, false)).toEqual([]);
    expect(continuationPages(chapter, true)).toEqual([outcome]);
  });
  it("does not expose legacy unsplit chapters or missing content", () => {
    expect(openingPages({ title: text("legacy"), pages: [opening, outcome] })).toEqual([]);
    expect(continuationPages({ title: text("legacy"), pages: [opening, outcome] }, true)).toEqual([]);
    expect(openingPages(null)).toEqual([]);
  });
});

describe("book pagination", () => {
  it("combines short editorial pages and balances the final screen", () => {
    const paragraph = (value: string) => text(value.repeat(200));
    const pages = [paragraph("a"), paragraph("b"), paragraph("c"), paragraph("d")]
      .map((entry) => ({ paragraphs: [entry] }));

    const result = paginateBookPages(pages);

    expect(result).toHaveLength(2);
    expect(result.map((page) => page.paragraphs)).toEqual([
      [pages[0]?.paragraphs[0], pages[1]?.paragraphs[0]],
      [pages[2]?.paragraphs[0], pages[3]?.paragraphs[0]],
    ]);
  });
});

describe("the canonical linear ending", () => {
  it("begins after the Architect's forensic session", () => {
    expect(FINAL_SCENES[0]?.id).toBe("architect-result");
    expect(FINAL_SCENES[0]?.code).toContain("THE ARCHITECT");
  });
  it("qualifies through an independent observer and preserves the cost of escrow", () => {
    expect(prose).toContain("SEQUENCE OBSERVER");
    expect(prose).toContain("VOSS SPEND AUTHORITY: NONE");
    expect(prose).toContain("ordem de serviço de Lower Meridian");
    expect(prose).toContain("SUBJECT: QUALIFIED");
    expect(prose).not.toContain("SUBJECT — ACCEPTED");
  });
  it("retains Mara’s consequence and an unidentified Lumen figure", () => {
    expect(prose).toContain("CREDENTIALS: SUSPENDED");
    const closing = FINAL_AFTER.at(-1);
    expect(closing?.id).toBe("lumen");
    expect(closing?.lines.map((line) => line.text["pt-BR"]).join(" ")).not.toContain("Rhea");
  });
});
