import { describe, expect, it, vi } from "vitest";

import {
  GLOBAL_NAMES,
  mountGlobals,
  mountWithoutInstance,
  resolveCalls,
  type Descriptor,
  type GlobalRegistry,
} from "./globals.ts";
import { subscribe, type CallEvent } from "./events.ts";
import { descriptorsFromSpec } from "./spec.ts";

const SPEC: Descriptor[] = [
  {
    name: "levels",
    doc: "The level index.",
    entries: [],
    outputs: ["Vec<u32>"],
  },
  {
    name: "create_instance",
    doc: "Creates a fresh instance, the player's alone, and returns the address.",
    entries: [
      { name: "player", kind: "Address" },
      { name: "level_id", kind: "u32" },
    ],
    outputs: ["Address"],
  },
];

describe("mountWithoutInstance", () => {
  it("exposes neither instance nor contract, and explains how to create one", () => {
    const target: GlobalRegistry = {};
    const writes = vi.fn();

    mountWithoutInstance(target, writes);

    expect(Object.hasOwn(target, "contract")).toBe(true);
    expect(target["contract"]).toBeUndefined();
    expect(target["instance"]).toBeUndefined();
    expect(target["player"]).toBeUndefined();
    expect(target["aux"]).toBeUndefined();

    expect(typeof target["help"]).toBe("function");
    (target["help"] as () => void)();

    expect(writes).toHaveBeenCalledOnce();
    expect(writes.mock.calls[0]?.[0]).toContain("New instance");
  });
});

describe("mountGlobals", () => {
  it("exposes the globals, and the contract is an object — never a string", () => {
    const target: GlobalRegistry = {};
    const contract = { levels: () => {}, create_instance: () => {} };

    mountGlobals(target, {
      player: "GPLAYER",
      instance: "CINSTANCE",
      contract: contract,
      spec: SPEC,
      aux: "CAUX",
      writes: () => {},
    });

    expect(target["player"]).toBe("GPLAYER");
    expect(target["instance"]).toBe("CINSTANCE");
    expect(target["contract"]).toBe(contract);
    expect(target["aux"]).toBe("CAUX");
    expect(typeof target["contract"]).not.toBe("string");
  });

  it("shows the auxiliary contract in help only when the level has one", () => {
    const withAux: GlobalRegistry = {};
    const writes = vi.fn();
    mountGlobals(withAux, {
      player: "GPLAYER",
      instance: "CINSTANCE",
      contract: {},
      spec: [],
      aux: "CAUX",
      writes,
    });
    (withAux["help"] as () => void)();
    expect(String(writes.mock.calls[0]?.[0])).toContain("window.aux");

    const withoutAux: GlobalRegistry = {};
    const otherWrites = vi.fn();
    mountGlobals(withoutAux, {
      player: "GPLAYER",
      instance: "CINSTANCE",
      contract: {},
      spec: [],
      writes: otherWrites,
    });
    (withoutAux["help"] as () => void)();
    expect(String(otherWrites.mock.calls[0]?.[0])).not.toContain("window.aux");
  });

  it("builds help from the spec, not from a hardcoded list", () => {
    const target: GlobalRegistry = {};
    const writes = vi.fn();

    mountGlobals(target, {
      player: "GPLAYER",
      instance: "CINSTANCE",
      contract: {},
      spec: SPEC,
      writes,
    });
    (target["help"] as () => void)();

    const output = String(writes.mock.calls[0]?.[0]);

    expect(output).toContain("window.contract.levels(): Vec<u32>");
    expect(output).toContain(
      "window.contract.create_instance(player: Address, level_id: u32): Address",
    );
    expect(output).toContain(
      "window.contract.create_instance({ player: <Address>, level_id: <u32> })",
    );
    expect(output).toContain("The level index.");
  });

  it("invents no method at all when the spec comes back empty", () => {
    const target: GlobalRegistry = {};
    const writes = vi.fn();

    mountGlobals(target, {
      player: "G",
      instance: "C",
      contract: {},
      spec: [],
      writes,
    });
    (target["help"] as () => void)();

    const output = String(writes.mock.calls[0]?.[0]);
    expect(output).toContain("returned no methods");
    expect(output).not.toContain("arguments go by name");
  });

  it("unmounts everything, and remounting leaves no dead instance behind", () => {
    const target: GlobalRegistry = {};

    const unmount = mountGlobals(target, {
      player: "G1",
      instance: "C1",
      contract: { brand: 1 },
      spec: SPEC,
      writes: () => {},
    });

    unmount();
    for (const name of GLOBAL_NAMES) {
      expect(Object.hasOwn(target, name)).toBe(false);
    }

    mountGlobals(target, {
      player: "G1",
      instance: "C2",
      contract: { brand: 2 },
      spec: SPEC,
      writes: () => {},
    });

    expect(target["instance"]).toBe("C2");
    expect(target["contract"]).toEqual({ brand: 2 });
  });
});

type Methods = Record<string, (...args: unknown[]) => Promise<unknown>>;

describe("resolveCalls", () => {
  it("answers a read with the value, and sends a write", async () => {
    const signAndSend = vi.fn(async () => ({ result: "sent" }));
    const wrapped = resolveCalls(
      {
        levels: async () => ({ isReadCall: true, result: 7 }),
        create_instance: async () => ({ isReadCall: false, signAndSend }),
      },
      SPEC,
    ) as Methods;

    await expect(wrapped["levels"]?.()).resolves.toBe(7);
    await expect(wrapped["create_instance"]?.()).resolves.toBe("sent");
    expect(signAndSend).toHaveBeenCalledOnce();
  });

  it("never sends a read", async () => {
    const signAndSend = vi.fn();
    const wrapped = resolveCalls(
      { levels: async () => ({ isReadCall: true, result: 1, signAndSend }) },
      SPEC,
    ) as Methods;

    await wrapped["levels"]?.();

    expect(signAndSend).not.toHaveBeenCalled();
  });

  it("lets a write the chain refuses throw, instead of swallowing it", async () => {
    const wrapped = resolveCalls(
      {
        create_instance: async () => ({
          isReadCall: false,
          signAndSend: async () => {
            throw new Error("boom");
          },
        }),
      },
      SPEC,
    ) as Methods;

    await expect(wrapped["create_instance"]?.()).rejects.toThrow("boom");
  });

  it("keeps everything the client had, including what the spec does not name", () => {
    const contract = { levels: async () => ({}), spec: { brand: "spec" }, extra: 1 };
    const wrapped = resolveCalls(contract, SPEC) as { spec?: unknown; extra?: unknown };

    expect(wrapped.spec).toBe(contract.spec);
    expect(wrapped.extra).toBe(1);
  });

  it("calls the method on the client, never on the copy the player gets", async () => {
    const contract = {
      levels: async function (this: unknown) {
        return { isReadCall: true, result: this === contract };
      },
      create_instance: async () => ({}),
    };

    await expect((resolveCalls(contract, SPEC) as Methods)["levels"]?.()).resolves.toBe(true);
  });

  it("names nothing when the spec names something the client does not have", () => {
    expect(Object.keys(resolveCalls({}, SPEC))).toEqual([]);
  });

  it("hands back what it got when the call is not one the SDK shaped", async () => {
    const odd = { hello: "world" };
    const wrapped = resolveCalls(
      { levels: async () => odd, create_instance: async () => ({}) },
      SPEC,
    ) as Methods;

    await expect(wrapped["levels"]?.()).resolves.toBe(odd);
  });
});

describe("the Breaker OS call events", () => {
  it("reports a read and a write without changing what the player gets", async () => {
    const seen: CallEvent[] = [];
    const off = subscribe((event) => {
      if (event.type === "call") seen.push(event);
    });

    const wrapped = resolveCalls(
      {
        levels: async () => ({ isReadCall: true, result: 7 }),
        create_instance: async () => ({
          isReadCall: false,
          signAndSend: async () => ({ result: "sent" }),
        }),
      },
      SPEC,
    ) as Methods;

    await expect(wrapped["levels"]?.()).resolves.toBe(7);
    await expect(wrapped["create_instance"]?.()).resolves.toBe("sent");
    off();

    expect(seen.map(({ method, kind, outcome }) => ({ method, kind, outcome }))).toEqual([
      { method: "levels", kind: "call", outcome: "pending" },
      { method: "levels", kind: "read", outcome: "accepted" },
      { method: "create_instance", kind: "call", outcome: "pending" },
      { method: "create_instance", kind: "write", outcome: "pending" },
      { method: "create_instance", kind: "write", outcome: "accepted" },
    ]);
  });

  it("announces each phase so the console can show progress", async () => {
    const phases: string[] = [];
    const wrapped = resolveCalls(
      {
        levels: async () => ({ isReadCall: true, result: 7 }),
        create_instance: async () => ({
          isReadCall: false,
          signAndSend: async () => ({ result: "sent" }),
        }),
      },
      SPEC,
      (method, phase) => phases.push(`${method}:${phase}`),
    ) as Methods;

    await wrapped["levels"]?.();
    await wrapped["create_instance"]?.();

    expect(phases).toEqual([
      "levels:calling",
      "levels:done",
      "create_instance:calling",
      "create_instance:signing",
      "create_instance:done",
    ]);
  });

  it("reports a failed write and gives the player a recoverable error", async () => {
    const seen: CallEvent[] = [];
    const off = subscribe((event) => {
      if (event.type === "call") seen.push(event);
    });

    const wrapped = resolveCalls(
      {
        create_instance: async () => ({
          isReadCall: false,
          signAndSend: async () => {
            throw new Error("boom");
          },
        }),
      },
      SPEC,
    ) as Methods;

    await expect(wrapped["create_instance"]?.()).rejects.toThrow(
      "BREAKER — create_instance could not be completed.",
    );
    off();

    expect(seen.map(({ method, kind, outcome }) => ({ method, kind, outcome }))).toEqual([
      { method: "create_instance", kind: "call", outcome: "pending" },
      { method: "create_instance", kind: "write", outcome: "pending" },
      { method: "create_instance", kind: "write", outcome: "failed" },
    ]);
  });

  it("explains that a simulated contract rejection is a state problem", async () => {
    const wrapped = resolveCalls(
      {
        read_private_record: async () => {
          throw new Error("Transaction simulation failed: HostError: Error(WasmVm, InvalidAction)");
        },
      },
      [{ name: "read_private_record", entries: [], outputs: [] }],
    ) as Methods;

    await expect(wrapped["read_private_record"]?.()).rejects.toThrow(
      "was rejected by the instance before a transaction could be signed",
    );
  });
});

const xdrString = (value: string): object => ({
  toString: () => value,
  toJSON: () => value,
});

const typeDef = (shape: unknown): object => ({
  toJSON: () => shape,
});

describe("descriptorsFromSpec", () => {
  it("reads the shape the SDK really returns, without taking a dead `this`", () => {
    const spec = {
      entries: ["create_instance", "__constructor"],
      funcs() {
        return this.entries.map((name) =>
          name === "__constructor"
            ? { name: xdrString(name), doc: xdrString(""), inputs: [], outputs: [] }
            : {
                name: xdrString(name),
                doc: xdrString("Creates a fresh instance."),
                inputs: [
                  { name: xdrString("player"), type: typeDef("address") },
                  { name: xdrString("level_id"), type: typeDef("u32") },
                ],
                outputs: [typeDef("address")],
              },
        );
      },
    };

    expect(descriptorsFromSpec(spec)).toEqual([
      {
        name: "create_instance",
        doc: "Creates a fresh instance.",
        entries: [
          { name: "player", kind: "Address" },
          { name: "level_id", kind: "u32" },
        ],
        outputs: ["Address"],
      },
    ]);
  });

  it("spells the composite types the way Rust spells them", () => {
    const spec = {
      funcs: () => [
        {
          name: xdrString("levels"),
          doc: xdrString(""),
          inputs: [],
          outputs: [typeDef({ vec: { element_type: "u32" } })],
        },
        {
          name: xdrString("register_level"),
          doc: xdrString(""),
          inputs: [{ name: xdrString("wasm_hash"), type: typeDef({ bytes_n: { n: 32 } }) }],
          outputs: [],
        },
      ],
    };

    expect(descriptorsFromSpec(spec).map((d) => d.outputs[0] ?? d.entries[0]?.kind)).toEqual([
      "Vec<u32>",
      "BytesN<32>",
    ]);
  });

  it("keeps the constructor out of the list the player is shown", () => {
    const spec = {
      funcs: () => [
        { name: xdrString("__constructor"), doc: xdrString(""), inputs: [], outputs: [] },
      ],
    };

    expect(descriptorsFromSpec(spec)).toEqual([]);
  });

  it("degrades to an empty list instead of taking the page down", () => {
    expect(descriptorsFromSpec(null)).toEqual([]);
    expect(descriptorsFromSpec({})).toEqual([]);
    expect(descriptorsFromSpec({ funcs: "not a list" })).toEqual([]);
  });

  it("shows the type name it does not know, instead of inventing one", () => {
    const spec = {
      funcs: () => [
        {
          name: xdrString("mystery"),
          doc: xdrString(""),
          inputs: [{ name: xdrString("x"), type: typeDef({ something_new: { a: 1, b: 2 } }) }],
          outputs: [],
        },
      ],
    };

    expect(descriptorsFromSpec(spec)[0]?.entries).toEqual([{ name: "x", kind: "something_new" }]);
  });
});

describe("argument coercion", () => {
  it("accepts the union object the player writes and hands the SDK tag/values", async () => {
    const spec = {
      getFunc: (name: string) =>
        name === "rewrite_payload"
          ? { inputs: [{ type: typeDef({ udt: { name: "Payload" } }) }] }
          : undefined,
      findEntry: (name: string) =>
        name === "Payload"
          ? {
              value: {
                cases: [
                  {
                    type: "scSpecUdtUnionCaseVoidV0",
                    value: { name: xdrString("OpenMaintenanceHatch") },
                  },
                  {
                    type: "scSpecUdtUnionCaseTupleV0",
                    value: { name: xdrString("GrantSpireAccess"), type: [typeDef("address")] },
                  },
                ],
              },
            }
          : undefined,
    };
    let received: unknown;
    const contract = {
      spec,
      rewrite_payload: async (payload: unknown) => {
        received = payload;
        return { isReadCall: true, result: true };
      },
    };
    const descriptor = {
      name: "rewrite_payload",
      entries: [{ name: "payload", kind: "Udt" }],
      outputs: [],
    };

    await (resolveCalls(contract, [descriptor]) as Methods)["rewrite_payload"]?.({
      payload: { GrantSpireAccess: "GAAA" },
    });

    expect(received).toEqual({ payload: { tag: "GrantSpireAccess", values: ["GAAA"] } });
  });

  it("accepts a hex string where the contract expects BytesN", async () => {
    const spec = { getFunc: () => ({ inputs: [{ type: typeDef({ bytes_n: { n: 32 } }) }] }) };
    let received: unknown;
    const contract = {
      spec,
      recover: async (fragment: unknown) => {
        received = fragment;
        return { isReadCall: true, result: true };
      },
    };
    const descriptor = {
      name: "recover",
      entries: [{ name: "fragment", kind: "Bytes" }],
      outputs: [],
    };

    await (resolveCalls(contract, [descriptor]) as Methods)["recover"]?.({
      fragment: "00".repeat(32),
    });

    const normalized = received as { fragment?: unknown };
    expect(normalized.fragment).toBeInstanceOf(Uint8Array);
    expect((normalized.fragment as Uint8Array).length).toBe(32);
  });
});
