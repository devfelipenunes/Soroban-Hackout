import type { LocalizedText } from "./text.ts";

export type StoryScene = {
  id: string;
  title: LocalizedText;
  paragraphs: readonly LocalizedText[];
};

export type CaseStory = {
  scenes: readonly StoryScene[];
};
