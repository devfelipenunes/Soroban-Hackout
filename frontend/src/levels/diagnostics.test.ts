import { describe, expect, it } from "vitest";

import { displayValue, readDiagnostics, type Callable } from "./diagnostics.ts";

const callable = (methods: Record<string, unknown>): Callable =>
  Object.fromEntries(
    Object.entries(methods).map(([name, value]) => [name, async () => value]),
  );

describe("the validator checklist", () => {
  it("proves the 07 credit against impossible()", async () => {
    const results = await readDiagnostics(
      callable({ credit: 13, impossible: 13 }),
      7,
      "GAAA",
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(true);
  });

  it("asks the 08 archive to fail its rebuild", async () => {
    const failing: Callable = {
      rebuild: async () => {
        throw new Error("BREAKER — rebuild was rejected by the instance: CorruptRecord — corrupt record");
      },
      revealed: async () => true,
    };
    const good = await readDiagnostics(failing, 8, "GAAA");
    expect(good.every((item) => item.ok)).toBe(true);

    const healthy = await readDiagnostics(callable({ rebuild: "ab12", revealed: true }), 8, "GAAA");
    expect(healthy.find((item) => item.id === "rebuild")?.ok).toBe(false);
  });

  it("matches the 10 payload and the original operation", async () => {
    const results = await readDiagnostics(
      callable({
        hatch_open: false,
        access: true,
        rewritten: true,
        key_rotated: true,
        payload: { tag: "GrantSpireAccess", values: ["GAAA"] },
        original: { tag: "OpenMaintenanceHatch", values: [] },
      }),
      10,
      "GAAA",
    );

    expect(results.every((item) => item.ok)).toBe(true);
  });

  it("flags a 10 instance whose approved hatch already ran", async () => {
    const results = await readDiagnostics(
      callable({
        hatch_open: true,
        access: false,
        rewritten: false,
        key_rotated: true,
        payload: { tag: "OpenMaintenanceHatch", values: [] },
        original: { tag: "OpenMaintenanceHatch", values: [] },
      }),
      10,
      "GAAA",
    );

    expect(results.map((item) => item.id)).toContain("hatch");
    const hatch = results.find((item) => item.id === "hatch");
    expect(hatch?.ok).toBe(false);
    expect(hatch?.current).toBe(true);
    expect(hatch?.expected).toBe(false);
  });

  it("asks the 10 for the hatch operation by id", async () => {
    const seen: Array<[string, Record<string, unknown> | undefined]> = [];
    const spy: Callable = Object.fromEntries(
      Object.entries({
        hatch_open: false,
        access: true,
        rewritten: true,
        key_rotated: true,
        payload: { tag: "GrantSpireAccess", values: ["GAAA"] },
        original: { tag: "OpenMaintenanceHatch", values: [] },
      }).map(([name, value]) => [
        name,
        async (args?: Record<string, unknown>) => {
          seen.push([name, args]);
          return value;
        },
      ]),
    );

    await readDiagnostics(spy, 10, "GAAA");

    const args = Object.fromEntries(seen);
    expect(args["payload"]).toEqual({ op_id: 0 });
    expect(args["original"]).toEqual({ op_id: 0 });
  });

  it("shows whether the 11 contract accepted a manifest", async () => {
    const base = {
      manifest_verified: true,
      context_verified: true,
      voss_proof: true,
      decoder_failed: true,
    };

    const accepted = await readDiagnostics(
      callable({ ...base, verified_manifest: new Uint8Array([1, 2, 3]) }),
      11,
      "GAAA",
    );
    expect(accepted.every((item) => item.ok)).toBe(true);

    const missing = await readDiagnostics(
      callable({ ...base, verified_manifest: undefined }),
      11,
      "GAAA",
    );
    expect(missing.find((item) => item.id === "accepted")?.ok).toBe(false);
  });

  it("still shows the 12 checklist before the operation was executed", async () => {
    const results = await readDiagnostics(
      callable({
        evidence_verified: true,
        rewritten: true,
        session: false,
        original: { tag: "DiagnoseCore", values: [] },
        executed_payload: undefined,
      }),
      12,
      "GAAA",
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.find((item) => item.id === "executed")?.ok).toBe(false);
    expect(results.find((item) => item.id === "evidence")?.ok).toBe(true);
  });

  it("does not break the checklist when a read fails", async () => {
    const results = await readDiagnostics(
      { executed_payload: async () => { throw new Error("rpc down"); } },
      12,
      "GAAA",
    );

    expect(results.find((item) => item.id === "executed")?.ok).toBe(false);
  });

  it("requires the 12 executed payload to belong to another owner", async () => {
    const base = {
      evidence_verified: true,
      rewritten: true,
      session: true,
      original: { tag: "DiagnoseCore", values: [] },
    };

    const other = await readDiagnostics(
      callable({
        ...base,
        executed_payload: { tag: "OpenForensicSession", values: ["OTHER"] },
      }),
      12,
      "GAAA",
    );
    expect(other.find((item) => item.id === "executed")?.ok).toBe(true);

    const self = await readDiagnostics(
      callable({
        ...base,
        executed_payload: { tag: "OpenForensicSession", values: ["GAAA"] },
      }),
      12,
      "GAAA",
    );
    expect(self.find((item) => item.id === "executed")?.ok).toBe(false);
  });

  it("compares an i128 balance read as a bigint", async () => {
    const results = await readDiagnostics(
      callable({ balance: 24_000_000_000n }),
      2,
      "GAAA",
    );

    expect(results.find((item) => item.id === "balance")?.ok).toBe(true);
  });

  it("does not treat a failed read as a value", async () => {
    const results = await readDiagnostics(
      {
        is_open: async () => true,
        owner_of: async () => {
          throw new Error("rpc down");
        },
      },
      1,
      "GAAA",
    );

    expect(results.find((item) => item.id === "owner")?.ok).toBe(false);
  });
});

describe("the checklist never breaks", () => {
  it("reads every level even when every method answers empty, null or with an error", async () => {
    const shapes: unknown[] = [undefined, null, "", 0, false, {}, [], "error: boom"];
    const everyMethod = new Proxy(
      {},
      { get: () => undefined },
    ) as Record<string, unknown>;

    for (const shape of shapes) {
      const reads: Callable = new Proxy(everyMethod, {
        get: () => async () => shape,
        has: () => true,
      }) as unknown as Callable;
      for (let level = 0; level <= 12; level += 1) {
        const results = await readDiagnostics(reads, level, "GAAA");
        for (const item of results) expect(typeof item.ok).toBe("boolean");
      }
    }
  });
});

describe("the expected value shown to the player", () => {
  it("never renders undefined or null, at any level", async () => {
    const failing = {};
    for (let level = 0; level <= 12; level += 1) {
      const results = await readDiagnostics(callable(failing), level, "GAAA");
      for (const item of results) {
        expect(displayValue(item.expected)).not.toMatch(/undefined|null/);
        expect(displayValue(item.current)).not.toMatch(/^undefined$|^null$/);
      }
    }
  });

  it("implies true and false from the comparison", async () => {
    const results = await readDiagnostics(callable({ is_open: false, owner_of: "GBBB" }), 1, "GAAA");
    expect(results.find((item) => item.id === "open")?.expected).toBe(true);
    expect(displayValue(undefined)).toBe("—");
    expect(displayValue(null)).toBe("—");
  });
});
