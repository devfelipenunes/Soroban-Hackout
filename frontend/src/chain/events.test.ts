import { describe, expect, it, vi } from "vitest";

import { emit, subscribe } from "./events.ts";

describe("the Breaker OS event bus", () => {
  it("delivers to every listener and stops after unsubscribe", () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = subscribe(first);
    const offSecond = subscribe(second);

    emit({ type: "rejected", at: 1 });

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();

    offFirst();
    offSecond();
    emit({ type: "instance", at: 2 });

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("keeps the method, the kind and the outcome of a call", () => {
    const seen: unknown[] = [];
    const off = subscribe((event) => seen.push(event));

    emit({ type: "call", id: 7, method: "open", kind: "write", outcome: "accepted", at: 3 });
    off();

    expect(seen).toEqual([
      { type: "call", id: 7, method: "open", kind: "write", outcome: "accepted", at: 3 },
    ]);
  });

  it("delivers an execution-window signal", () => {
    const seen: unknown[] = [];
    const off = subscribe((event) => seen.push(event));

    emit({ type: "ledger-ready", at: 9 });
    off();

    expect(seen).toEqual([{ type: "ledger-ready", at: 9 }]);
  });
});
