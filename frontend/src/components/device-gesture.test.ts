import { describe, expect, it } from "vitest";

import { swipeDestination } from "./device-gesture.ts";

describe("swipeDestination", () => {
  it("does not navigate when the gesture scrolled a surface", () => {
    expect(
      swipeDestination({ delta: -120, view: "home", scrollDelta: 90 }),
    ).toBeNull();
  });

  it("opens controls from the home when nothing scrolled", () => {
    expect(
      swipeDestination({ delta: -49, view: "home", scrollDelta: 0 }),
    ).toBe("controls");
  });

  it("does not open controls from an app", () => {
    expect(
      swipeDestination({ delta: -120, view: "operations", scrollDelta: 0 }),
    ).toBeNull();
  });

  it("returns home from controls", () => {
    expect(
      swipeDestination({ delta: 60, view: "controls", scrollDelta: 0 }),
    ).toBe("home");
  });

  it("ignores short gestures", () => {
    expect(
      swipeDestination({ delta: -20, view: "home", scrollDelta: 0 }),
    ).toBeNull();
  });
});
