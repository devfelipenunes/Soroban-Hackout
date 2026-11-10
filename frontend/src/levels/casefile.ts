import type { LocalizedText } from "./text.ts";

export type CaseFile = {
  objective: LocalizedText;
  target: LocalizedText;
  owner: LocalizedText;
  network: LocalizedText;
  lead?: LocalizedText;
  known: readonly LocalizedText[];
  unknown: readonly LocalizedText[];
  reading: readonly LocalizedText[];
};
