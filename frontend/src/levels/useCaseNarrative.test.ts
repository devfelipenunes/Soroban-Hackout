import { describe, expect, it } from "vitest";

import type { CallEvent } from "../chain/events.ts";
import { EMPTY_CASE } from "../game/caseStore.ts";
import { choiceAnchors, conversationBeats, availableDialogueReplies, sendDialogueReply, type DialogueReply, type ChatExchange, type Narrative } from "./narrative.ts";
import { addHint, applyToneChoice, revealBeats, upsertCall, visibleNarrativeRecord } from "./useCaseNarrative.ts";

const call = (id: number, overrides: Partial<CallEvent> = {}): CallEvent => ({
  type: "call",
  id,
  method: "open",
  kind: "call",
  outcome: "pending",
  at: id,
  ...overrides,
});

describe("the terminal call log", () => {
  it("replaces a pending call with its final state instead of duplicating it", () => {
    const pending = call(1);
    const accepted = call(1, { kind: "read", outcome: "accepted", at: 2 });

    expect(upsertCall([pending], accepted)).toEqual([accepted]);
  });

  it("appends a new call and keeps only the newest fifty", () => {
    const first = call(1);
    const second = call(2);

    expect(upsertCall([], first)).toEqual([first]);
    expect(upsertCall([first], second)).toEqual([first, second]);

    const many = Array.from({ length: 50 }, (_, index) => call(index + 1));
    const extra = call(99);
    const kept = upsertCall(many, extra);

    expect(kept).toHaveLength(50);
    expect(kept.at(-1)).toEqual(extra);
    expect(kept[0]?.id).toBe(2);
  });
});

describe("the hint trail", () => {  it("records each hint once, with its source and timestamp", () => {
    const first = addHint(EMPTY_CASE, "casefile");

    expect(first.hintLevel).toBe(1);
    expect(first.hints).toHaveLength(1);
    expect(first.hints[0]?.source).toBe("casefile");
    expect(first.hints[0]?.at).toBeGreaterThan(0);
    expect(first.assisted).toBe(false);
  });

  it("marks the case assisted when the third hint is revealed", () => {
    const third = addHint(
      addHint(addHint(EMPTY_CASE, "casefile"), "casefile"),
      "casefile",
    );

    expect(third.hintLevel).toBe(3);
    expect(third.assisted).toBe(true);
    expect(addHint(third, "casefile")).toBe(third);
  });

  it("keeps the stuck source and does not duplicate the first hint", () => {
    const stuck = addHint(EMPTY_CASE, "stuck");

    expect(stuck.hintLevel).toBe(1);
    expect(stuck.hints[0]?.source).toBe("stuck");
    expect(addHint(stuck, "casefile").hints).toHaveLength(2);
  });
});

const text = (value: string) => ({ "pt-BR": value, en: value, es: value });

const choice = {
  id: "tone-alpha",
  trigger: "call:alpha" as const,
  prompt: text("do you believe it?"),
  options: [
    { tone: "confidence" as const, label: text("yes"), response: text("good") },
    { tone: "doubt" as const, label: text("no"), response: text("keep asking") },
  ],
};

const narrative: Narrative = {
  beats: [
    { trigger: "call:alpha", speaker: "mara", text: text("alpha one") },
    { trigger: "call:beta", speaker: "breaker", text: text("beta one") },
    { trigger: "call:alpha", speaker: "system", text: text("alpha two") },
  ],
  evidence: [
    {
      id: "beta-proof",
      label: text("beta"),
      value: text("valid"),
      reveal: "call:beta",
    },
  ],
  choices: [choice],
};

describe("the COMMS feed", () => {
  it("keeps the order the beats fired, not the order of the file", () => {
    const beta = revealBeats(EMPTY_CASE, narrative, "call:beta");
    const alpha = revealBeats(beta, narrative, "call:alpha");

    expect(alpha.fired).toEqual([1, 0, 2]);
  });

  it("does not duplicate a beat when a trigger fires twice", () => {
    const first = revealBeats(EMPTY_CASE, narrative, "call:alpha");
    const again = revealBeats(first, narrative, "call:alpha");

    expect(again.fired).toEqual([0, 2]);
    expect(again).toBe(first);
  });

  it("reveals the evidence of the same trigger", () => {
    const beta = revealBeats(EMPTY_CASE, narrative, "call:beta");

    expect(beta.revealed).toEqual(["beta-proof"]);
  });
});

describe("the tone choices", () => {
  it("anchors a choice after the last position where its trigger fired", () => {
    const fired = revealBeats(EMPTY_CASE, narrative, "call:beta").fired;
    const both = revealBeats({ ...EMPTY_CASE, fired }, narrative, "call:alpha").fired;

    expect(both).toEqual([1, 0, 2]);
    expect(choiceAnchors(both, narrative).get(2)?.map((item) => item.id)).toEqual([
      "tone-alpha",
    ]);
  });

  it("does not anchor a choice whose trigger never fired", () => {
    expect(choiceAnchors([], narrative).size).toBe(0);
    expect(choiceAnchors([1], narrative).size).toBe(0);
  });

  it("records a tone only after the trigger fired", () => {
    expect(applyToneChoice(EMPTY_CASE, narrative, "tone-alpha", "doubt")).toBe(EMPTY_CASE);

    const fired = revealBeats(EMPTY_CASE, narrative, "call:alpha");
    const chosen = applyToneChoice(fired, narrative, "tone-alpha", "doubt");

    expect(chosen.choices).toEqual({ "tone-alpha": "doubt" });
  });

  it("keeps the first tone and ignores unknown choices", () => {
    const fired = revealBeats(EMPTY_CASE, narrative, "call:alpha");
    const chosen = applyToneChoice(fired, narrative, "tone-alpha", "confidence");
    const again = applyToneChoice(chosen, narrative, "tone-alpha", "doubt");
    const unknown = applyToneChoice(fired, narrative, "tone-missing", "doubt");

    expect(again).toBe(chosen);
    expect(unknown).toBe(fired);
  });
});


describe("conversations belong to revealed characters in the current case", () => {
  const script: Narrative = {
    beats: [
      { speaker: "mara", trigger: "start", text: text("Mara briefing") },
      { speaker: "breaker", trigger: "start", text: text("Player answer") },
      { speaker: "custodian", trigger: "instance", text: text("Custodian greeting") },
      { speaker: "system", trigger: "instance", text: text("Door status") },
      { speaker: "voss", trigger: "solved", text: text("Voss revelation") },
    ], evidence: [],
  };
  it("does not reveal future contacts or messages", () => {
    const threads = conversationBeats(script, [0, 1]);
    expect([...threads.keys()]).toEqual(["mara"]);
    expect(threads.get("mara")).toEqual([0, 1]);
  });
  it("keeps player responses with the current speaker and excludes system telemetry", () => {
    const threads = conversationBeats(script, [0, 1, 2, 3]);
    expect(threads.get("mara")).toEqual([0, 1]);
    expect(threads.get("custodian")).toEqual([2]);
    expect(threads.has("voss")).toBe(false);
  });
  it("adds a person only when their message is revealed", () => {
    expect(conversationBeats(script, [0, 2, 4]).get("voss")).toEqual([4]);
  });
  it("does not carry contacts across cases or accept unknown beat ids", () => {
    const next: Narrative = { beats: [{ speaker: "mara", trigger: "start", text: text("Another case") }], evidence: [] };
    expect([...conversationBeats(next, [0, 9]).entries()]).toEqual([["mara", [0]]]);
  });
  it("keeps the home conversation separate from case transmissions", () => {
    expect([...conversationBeats(null, [0]).entries()]).toEqual([["mara", []]]);
  });
});


describe("one-use scripted messages", () => {
  const script: Narrative = {
    beats: [
      { speaker: "mara", trigger: "start", text: text("Briefing") },
      { speaker: "custodian", trigger: "instance", text: text("Identity check") },
      { speaker: "mara", trigger: "solved", text: text("Solved") },
    ], evidence: [],
  };
  const replies: DialogueReply[] = [
    { id: "question", contact: "mara", trigger: "start", label: text("Question?"), response: text("Answer") },
    { id: "follow-up", contact: "mara", trigger: "solved", label: text("Next?"), response: text("Later answer") },
    { id: "identity", contact: "custodian", trigger: "instance", label: text("Who?"), response: text("Operator") },
  ];
  it("only offers the current person's revealed questions", () => {
    expect(availableDialogueReplies(replies, script, [0], [], "mara").map((r) => r.id)).toEqual(["question"]);
    expect(availableDialogueReplies(replies, script, [0], [], "custodian")).toEqual([]);
    expect(availableDialogueReplies(replies, script, [0, 1], [], "custodian").map((r) => r.id)).toEqual(["identity"]);
  });
  it("removes a sent option, retaining both sides of the exchange", () => {
    const history = sendDialogueReply([], replies, script, [0], "mara", "question");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ contact: "mara", after: 1, label: text("Question?"), reply: text("Answer") });
    expect(availableDialogueReplies(replies, script, [0], history, "mara")).toEqual([]);
    expect(sendDialogueReply(history, replies, script, [0], "mara", "question")).toBe(history);
  });
  it("rejects premature, unknown and other-contact messages", () => {
    const history: ChatExchange[] = [];
    for (const id of ["follow-up", "identity", "missing"]) expect(sendDialogueReply(history, replies, script, [0], "mara", id)).toBe(history);
  });
  it("unlocks later messages without restoring used options", () => {
    const history = sendDialogueReply([], replies, script, [0], "mara", "question");
    expect(availableDialogueReplies(replies, script, [0, 2], history, "mara").map((r) => r.id)).toEqual(["follow-up"]);
  });
  it("keeps sent options consumed after serialization and leaves other cases independent", () => {
    const history = sendDialogueReply([], replies, script, [0], "mara", "question");
    const restored: ChatExchange[] = JSON.parse(JSON.stringify(history));
    expect(availableDialogueReplies(replies, script, [0], restored, "mara")).toEqual([]);
    expect(availableDialogueReplies(replies, script, [0], [], "mara")).toHaveLength(1);
    expect(availableDialogueReplies(replies, script, [0, 1], restored, "custodian")).toHaveLength(1);
  });
  it("supports the home conversation and legacy exchanges", () => {
    const legacy: ChatExchange[] = [{ id: "old", text: "Old question", reply: text("Old answer"), after: 0 }];
    expect(availableDialogueReplies(replies, null, [], legacy, "mara").map((r) => r.id)).toEqual(["question"]);
    expect(sendDialogueReply(legacy, replies, null, [], "mara", "question")).toHaveLength(2);
  });
});


describe("completion is not inferred from cached narrative indices", () => {
  const script: Narrative = {
    beats: [
      { trigger: "start", speaker: "mara", text: text("Arrival") },
      { trigger: "previous-solved", speaker: "voss", text: text("Previous outcome") },
      { trigger: "solved", speaker: "system", text: text("Confirmed") },
    ], evidence: [], documents: [{ id: "previous-file", title: text("File"), source: text("Archive"), body: [text("Secret")], reveal: "previous-solved" }],
  };
  const cached = revealBeats(revealBeats(revealBeats(EMPTY_CASE, script, "start"), script, "previous-solved"), script, "solved");
  it("hides cached endings while chain confirmation is pending or false", () => {
    const visible = visibleNarrativeRecord(cached, script, false, false);
    expect(visible.fired).toEqual([0]);
    expect(visible.revealed).toEqual([]);
  });
  it("unlocks only the confirmed previous case, without completing the current one", () => {
    const visible = visibleNarrativeRecord(cached, script, false, true);
    expect(visible.fired).toEqual([0, 1]);
    expect(visible.revealed).toEqual(["previous-file"]);
  });
});
