import { afterEach, describe, expect, it, vi } from "vitest";

import { latestLedger, ledgersUntil, readClock, secondsFor } from "./ledger.ts";
import { RPC_URL } from "./network.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("the ledger clock", () => {
  it("counts the ledgers left, never negative", () => {
    expect(ledgersUntil(120, 100)).toBe(20);
    expect(ledgersUntil(100, 120)).toBe(0);
  });

  it("converts ledgers to the approximate seconds", () => {
    expect(secondsFor(3)).toBe(15);
  });

  it("reads the sequence without decoding the ledger header", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { sequence: 5554487, headerXdr: "unknown-to-this-sdk" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(latestLedger()).resolves.toBe(5554487);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(RPC_URL);
    expect(JSON.parse(String(init.body))).toMatchObject({ method: "getLatestLedger" });
  });

  it("fails loudly when the RPC answers without a sequence", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "rpc down" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    await expect(latestLedger()).rejects.toThrow("rpc down");
  });

  it("fails loudly on a non-2xx answer", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;

    await expect(latestLedger()).rejects.toThrow("HTTP 503");
  });

  it("reads the sequencer only in the 09", async () => {
    const seen: string[] = [];
    const clock = await readClock(
      {
        current_sequence: async () => {
          seen.push("current_sequence");
          return 100;
        },
        eta: async () => {
          seen.push("eta");
          return 90;
        },
      },
      9,
      110,
    );

    expect(clock).toEqual({ latest: 110, current: 100, target: 100 });
    expect(seen).toEqual(["current_sequence"]);
  });

  it("asks the 10 for the hatch eta by id and uses the latest ledger as current", async () => {
    let args: Record<string, unknown> | undefined;
    const clock = await readClock(
      {
        eta: async (received) => {
          args = received;
          return 90;
        },
      },
      10,
      110,
    );

    expect(args).toEqual({ op_id: 0 });
    expect(clock).toEqual({ latest: 110, current: 110, target: 90 });
  });

  it("asks the 12 for eta without arguments", async () => {
    let received: Record<string, unknown> | undefined | "unset" = "unset";
    const clock = await readClock(
      {
        eta: async (args) => {
          received = args;
          return 90;
        },
      },
      12,
      110,
    );

    expect(received).toBeUndefined();
    expect(clock).toEqual({ latest: 110, current: 110, target: 90 });
  });

  it("has no clock outside 09, 10 and 12", async () => {
    await expect(readClock({}, 11, 110)).resolves.toBeNull();
  });

  it("returns no clock when eta is not a number", async () => {
    await expect(readClock({ eta: async () => "later" }, 10, 110)).resolves.toBeNull();
  });
});
