import { describe, expect, it } from "vitest";

import { COOLDOWN_MS, createFlag } from "./flag.ts";

function timer(start = 1_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("the submit button's 2 s flag", () => {
  it("starts released — the first click is never held back", () => {
    const r = timer();
    expect(createFlag(COOLDOWN_MS, r.now).released()).toBe(true);
  });

  it("locks right after the click", () => {
    const r = timer();
    const flag = createFlag(COOLDOWN_MS, r.now);

    flag.mark();

    expect(flag.released()).toBe(false);
  });

  it("stays locked 1 ms before the end, and releases exactly on the turn", () => {
    const r = timer();
    const flag = createFlag(COOLDOWN_MS, r.now);
    flag.mark();

    r.advance(COOLDOWN_MS - 1);
    expect(flag.released()).toBe(false);

    r.advance(1);
    expect(flag.released()).toBe(true);
  });

  it("counts down what is left, and never returns a negative number", () => {
    const r = timer();
    const flag = createFlag(COOLDOWN_MS, r.now);
    flag.mark();

    expect(flag.remaining()).toBe(COOLDOWN_MS);

    r.advance(500);
    expect(flag.remaining()).toBe(1_500);

    r.advance(5_000);
    expect(flag.remaining()).toBe(0);
  });

  it("a further click restarts the countdown", () => {
    const r = timer();
    const flag = createFlag(COOLDOWN_MS, r.now);

    flag.mark();
    r.advance(1_900);
    expect(flag.released()).toBe(false);

    flag.mark();
    r.advance(1_900);
    expect(flag.released()).toBe(false);

    r.advance(100);
    expect(flag.released()).toBe(true);
  });
});
