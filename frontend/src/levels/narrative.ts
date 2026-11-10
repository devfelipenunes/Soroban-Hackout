import type { Language } from "../i18n/translate.ts";

export type NarrativeText = Readonly<Record<Language, string>>;

export type Speaker =
  | "mara"
  | "breaker"
  | "system"
  | "custodian"
  | "voss"
  | "architect";

export type NarrativeTrigger =
  | "start"
  | "previous-solved"
  | "instance"
  | "first-call"
  | "rejected"
  | "stuck"
  | "ledger-ready"
  | "solved"
  | `call:${string}`;

export type NarrativeBeat = {
  trigger: NarrativeTrigger;
  speaker: Speaker;
  text: NarrativeText;
};

export type NarrativeEvidence = {
  id: string;
  label: NarrativeText;
  value: NarrativeText;
  reveal: NarrativeTrigger;
  documentId?: string;
};

export type NarrativeDocument = {
  id: string;
  title: NarrativeText;
  source: NarrativeText;
  body: readonly NarrativeText[];
  reveal: NarrativeTrigger;
};

export type Narrative = {
  beats: readonly NarrativeBeat[];
  evidence: readonly NarrativeEvidence[];
  choices?: readonly NarrativeChoice[];
  hints?: readonly NarrativeText[];
  replies?: readonly DialogueReply[];
  documents?: readonly NarrativeDocument[];
};

export type ContactSpeaker = Exclude<Speaker, "breaker" | "system">;


export function conversationBeats(narrative: Narrative | null, fired: readonly number[]): ReadonlyMap<ContactSpeaker, readonly number[]> {
  const threads = new Map<ContactSpeaker, number[]>([["mara", []]]);
  let contact: ContactSpeaker = "mara";
  for (const index of fired) {
    const beat = narrative?.beats[index];
    if (!beat) continue;

    if (beat.speaker === "system") continue;
    if (beat.speaker !== "breaker") contact = beat.speaker;
    const messages = threads.get(contact) ?? [];
    messages.push(index);
    threads.set(contact, messages);
  }
  return threads;
}

export const TONES = ["confidence", "doubt", "silence"] as const;

export type Tone = (typeof TONES)[number];

export function isTone(value: unknown): value is Tone {
  return typeof value === "string" && (TONES as readonly string[]).includes(value);
}

export type NarrativeChoiceOption = {
  tone: Tone;
  label: NarrativeText;
  response: NarrativeText;
};

export type NarrativeChoice = {
  id: string;
  trigger: NarrativeTrigger;
  prompt: NarrativeText;
  options: readonly NarrativeChoiceOption[];
};

export function choiceAnchors(
  fired: readonly number[],
  narrative: Narrative,
): ReadonlyMap<number, readonly NarrativeChoice[]> {
  const slots = new Map<number, NarrativeChoice[]>();

  for (const choice of narrative.choices ?? []) {
    let slot = -1;
    fired.forEach((beatIndex, position) => {
      if (narrative.beats[beatIndex]?.trigger === choice.trigger) slot = position;
    });
    if (slot >= 0) slots.set(slot, [...(slots.get(slot) ?? []), choice]);
  }

  return slots;
}


export type DialogueReply = {
  id: string;
  contact: ContactSpeaker;
  trigger: NarrativeTrigger;
  label: NarrativeText;
  response: NarrativeText;
};

export type ChatExchange = {
  id: string;
  after: number;
  text: string;
  reply: NarrativeText;

  optionId?: string;
  contact?: ContactSpeaker;
  label?: NarrativeText;
};

export function availableDialogueReplies(
  replies: readonly DialogueReply[],
  narrative: Narrative | null,
  fired: readonly number[],
  history: readonly ChatExchange[],
  contact: ContactSpeaker,
): readonly DialogueReply[] {
  const contacts = conversationBeats(narrative, fired);
  if (!contacts.has(contact)) return [];
  return replies.filter(
    (reply) =>
      reply.contact === contact &&
      !history.some((entry) => entry.optionId === reply.id) &&
      (reply.trigger === "start" ||
        fired.some((index) => narrative?.beats[index]?.trigger === reply.trigger)),
  );
}


export function sendDialogueReply(
  history: ChatExchange[],
  replies: readonly DialogueReply[],
  narrative: Narrative | null,
  fired: readonly number[],
  contact: ContactSpeaker,
  optionId: string,
): ChatExchange[] {
  const option = availableDialogueReplies(
    replies, narrative, fired, history, contact,
  ).find((reply) => reply.id === optionId);
  if (!option) return history;
  return [
    ...history,
    {
      id: `reply:${option.id}`,
      optionId: option.id,
      contact,
      after: fired.length,
      text: option.label["pt-BR"],
      label: option.label,
      reply: option.response,
    },
  ];
}
