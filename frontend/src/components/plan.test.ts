import { describe, expect, it } from "vitest";

import type { Descriptor } from "../chain/globals.ts";
import {
  buildCall,
  expressionFor,
  isSimpleExpression,
  rawFor,
  scalarKind,
  unionExpression,
  updateCellArguments,
  variantFor,
  waitSource,
  type OperationCell,
} from "./plan.ts";

const transfer: Descriptor = {
  name: "transfer",
  entries: [
    { name: "to", kind: "Address" },
    { name: "amount", kind: "i128" },
    {
      name: "memo",
      kind: "Udt",
      variants: [
        { name: "None", inputs: [] },
        { name: "Text", inputs: ["String"] },
      ],
    },
  ],
  outputs: ["bool"],
};

const ping: Descriptor = {
  name: "ping",
  entries: [],
  outputs: [],
};

describe("buildCall", () => {
  it("renders a no-argument call", () => {
    expect(buildCall(ping, {})).toBe("return await window.contract.ping();");
  });

  it("renders named arguments in the order the spec declares them", () => {
    expect(
      buildCall(transfer, {
        to: "window.player",
        amount: "5",
        memo: '"None"',
      }),
    ).toBe(
      "return await window.contract.transfer({ to: window.player, amount: 5, memo: \"None\" });",
    );
  });

  it("falls back to null for an argument the plan does not carry", () => {
    expect(buildCall(transfer, { to: "window.player" })).toContain(
      "amount: null",
    );
  });
});

describe("unionExpression", () => {
  it("renders a unit variant as its tag", () => {
    expect(unionExpression({ name: "None", inputs: [] })).toBe('"None"');
  });

  it("seeds a variant with inputs", () => {
    expect(unionExpression({ name: "Text", inputs: ["String"] })).toBe(
      '{ Text: "" }',
    );
  });

  it("keeps an edited value inside the tag", () => {
    expect(unionExpression({ name: "Text", inputs: ["String"] }, '"hi"')).toBe(
      '{ Text: "hi" }',
    );
  });
});

describe("wait steps", () => {
  it("builds a promise-based wait the runner can execute", () => {
    expect(waitSource(5_000)).toBe(
      "await new Promise((resolve) => setTimeout(resolve, 5000));",
    );
    expect(waitSource(-10)).toBe(
      "await new Promise((resolve) => setTimeout(resolve, 0));",
    );
  });
});

describe("typed argument values", () => {  it("classifies the scalar kinds the plan can render", () => {
    expect(scalarKind("String")).toBe("string");
    expect(scalarKind("Address")).toBe("address");
    expect(scalarKind("u32")).toBe("integer");
    expect(scalarKind("bool")).toBe("bool");
    expect(scalarKind("BytesN<32>")).toBe("bytes");
    expect(scalarKind("Vec<u32>")).toBe("vec");
    expect(scalarKind("Udt")).toBe("other");
  });

  it("builds a JS expression from the typed value", () => {
    expect(expressionFor("String", "Meridian")).toBe('"Meridian"');
    expect(expressionFor("Address", "GABC")).toBe('"GABC"');
    expect(expressionFor("Address", "window.player")).toBe("window.player");
    expect(expressionFor("u32", "42")).toBe("42");
    expect(expressionFor("u32", "")).toBe("0");
    expect(expressionFor("bool", "true")).toBe("true");
    expect(expressionFor("BytesN<2>", "0a0b")).toBe(
      "new Uint8Array([10, 11])",
    );
    expect(expressionFor("Vec<u32>", "1, 2")).toBe("[1, 2]");
  });

  it("reads the typed value back from the expression", () => {
    expect(rawFor("String", '"Meridian"')).toBe("Meridian");
    expect(rawFor("Address", '"GABC"')).toBe("GABC");
    expect(rawFor("Address", "window.player")).toBe("window.player");
    expect(rawFor("u32", "42")).toBe("42");
    expect(rawFor("u32", "await count()")).toBe("");
    expect(rawFor("BytesN<2>", "new Uint8Array([10, 11])")).toBe("0a0b");
    expect(rawFor("Vec<u32>", "[1, 2]")).toBe("1, 2");
  });

  it("only offers a typed control when the expression is a simple literal", () => {
    expect(isSimpleExpression("String", '"Meridian"')).toBe(true);
    expect(isSimpleExpression("String", "window.player")).toBe(false);
    expect(isSimpleExpression("Address", "window.player")).toBe(true);
    expect(isSimpleExpression("Address", "await owner()")).toBe(false);
    expect(isSimpleExpression("u32", "42")).toBe(true);
    expect(isSimpleExpression("u32", "await count()")).toBe(false);
    expect(isSimpleExpression("BytesN<2>", "new Uint8Array([10, 11])")).toBe(true);
    expect(isSimpleExpression("BytesN<32>", "new Uint8Array(32)")).toBe(false);
    expect(isSimpleExpression("Vec<u32>", "[1, 2]")).toBe(true);
    expect(isSimpleExpression("Udt", "null")).toBe(false);
  });
});

describe("updateCellArguments", () => {
  const cell: OperationCell = {
    id: "cell-1",
    source: buildCall(transfer, {
      to: "window.player",
      amount: "0",
      memo: '"None"',
    }),
    method: "transfer",
    args: { to: "window.player", amount: "0", memo: '"None"' },
    variants: { memo: "None" },
  };

  it("rebuilds the source when an argument changes", () => {
    const next = updateCellArguments(cell, transfer, { amount: "42" }, undefined);

    expect(next.args?.amount).toBe("42");
    expect(next.source).toContain("amount: 42");
    expect(next.method).toBe("transfer");
  });

  it("rebuilds the tagged argument when the variant changes", () => {
    const text = { name: "Text", inputs: ["String"] };
    const next = updateCellArguments(
      cell,
      transfer,
      { memo: unionExpression(text) },
      { memo: "Text" },
    );

    expect(next.variants?.memo).toBe("Text");
    expect(next.args?.memo).toBe('{ Text: "" }');
    expect(next.source).toContain('memo: { Text: "" }');
  });

  it("does not change a custom script with no descriptor", () => {
    const custom: OperationCell = { id: "x", source: "return 1;" };
    expect(updateCellArguments(custom, undefined, { a: "1" }, undefined)).toBe(custom);
  });

  it("selects the requested variant, then the first one", () => {
    const entry = transfer.entries[2];
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    expect(variantFor(entry, { memo: "Text" })?.name).toBe("Text");
    expect(variantFor(entry, {})?.name).toBe("None");
  });
});
