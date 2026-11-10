import { emit, type CallFailure } from "./events.ts";

export const GLOBAL_NAMES = ["player", "instance", "contract", "aux", "help"] as const;

export type GlobalName = (typeof GLOBAL_NAMES)[number];

export type GlobalRegistry = Record<string, unknown>;

export type Entry = {
  name: string;
  kind: string;
};

export type Descriptor = {
  name: string;
  doc?: string | undefined;
  entries: readonly Entry[];
  outputs: readonly string[];
};

export type Options = {
  player: string;
  instance: string;
  contract: object;
  spec: readonly Descriptor[];
  aux?: string | undefined;
  writes?: (text: string) => void;
};

type Transaction = {
  isReadCall?: unknown;
  result?: unknown;
  signAndSend?: unknown;
};

type UnionCase = { readonly name: string; readonly hasValues: boolean };

function failureOf(error: unknown): CallFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (/cancel|declin|reject.*wallet/i.test(message)) return "cancelled";
  if (/simulation failed|HostError|WasmVm/i.test(message)) return "rejected";
  return "unknown";
}

function playerError(method: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  const failure = failureOf(error);
  const summary =
    failure === "rejected"
      ? `BREAKER — ${method} was rejected by the instance before a transaction could be signed. The current state does not allow this call; inspect it and try a different sequence.`
      : failure === "cancelled"
        ? `BREAKER — ${method} was not signed by the wallet. Approve the request to continue.`
        : `BREAKER — ${method} could not be completed. Check the technical detail below and try again.`;
  return new Error(`${summary}\n\nTechnical detail: ${detail}`, { cause: error });
}

function readValue<T>(value: unknown): T | undefined {
  if (typeof value === "function") {
    try {
      return (value as () => T)();
    } catch {
      return undefined;
    }
  }
  return value as T | undefined;
}

function jsonValue(value: unknown): unknown {
  const raw = readValue<unknown>(value);
  if (raw === null || typeof raw !== "object") return raw;

  const toJSON = (raw as { toJSON?: unknown }).toJSON;
  if (typeof toJSON !== "function") return raw;

  try {
    return (toJSON as () => unknown).call(raw);
  } catch {
    return raw;
  }
}

function udtName(type: unknown): string | undefined {
  const json = jsonValue(type);
  if (json === null || typeof json !== "object") return undefined;

  const udt = (json as { udt?: unknown }).udt;
  if (typeof udt === "string") return udt;
  if (udt !== null && typeof udt === "object") {
    const name = (udt as { name?: unknown }).name;
    if (typeof name === "string") return name;
    const rendered = String(name ?? "");
    if (rendered !== "" && rendered !== "[object Object]") return rendered;
  }
  return undefined;
}

function unionCases(spec: unknown, name: string): readonly UnionCase[] | undefined {
  const find = (spec as { findEntry?: unknown } | null)?.findEntry;
  if (typeof find !== "function") return undefined;

  let entry: unknown;
  try {
    entry = (find as (value: string) => unknown).call(spec, name);
  } catch {
    return undefined;
  }

  const value = readValue<{ cases?: unknown }>((entry as { value?: unknown } | null)?.value);
  const cases = readValue<unknown[]>(value?.cases);
  if (!Array.isArray(cases)) return undefined;

  return cases.map((item) => {
    const caseValue = readValue<{ name?: unknown }>((item as { value?: unknown } | null)?.value);
    const caseName = readValue<unknown>(caseValue?.name);
    const kind = readValue<unknown>((item as { type?: unknown } | null)?.type);
    return {
      name: caseName === undefined ? "" : String(caseName),
      hasValues: String(kind ?? "").includes("Tuple"),
    };
  });
}

function toBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
    return Uint8Array.from(value as number[]);
  }
  if (typeof value === "string") {
    const hex = value.startsWith("0x") ? value.slice(2) : value;
    if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return undefined;
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }
  return undefined;
}

function normalizeUnion(value: unknown, cases: readonly UnionCase[]): unknown {
  if (value !== null && typeof value === "object" && "tag" in value) return value;

  if (typeof value === "string") {
    const found = cases.find((item) => item.name === value);
    if (found === undefined) return value;
    return found.hasValues ? { tag: value, values: [] } : { tag: value };
  }

  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 1) {
      const key = keys[0];
      if (key === undefined) return value;
      const found = cases.find((item) => item.name === key);
      if (found !== undefined) {
        const inner = (value as Record<string, unknown>)[key];
        if (!found.hasValues) return { tag: key };
        return Array.isArray(inner) ? { tag: key, values: inner } : { tag: key, values: [inner] };
      }
    }
  }

  return value;
}

function normalizeArg(value: unknown, type: unknown, spec: unknown): unknown {
  const name = udtName(type);
  if (name !== undefined) {
    const cases = unionCases(spec, name);
    if (cases !== undefined) return normalizeUnion(value, cases);
  }

  const json = jsonValue(type);
  if (json === "bytes") return toBytes(value) ?? value;
  if (json !== null && typeof json === "object") {
    const bytesN = (json as { bytes_n?: { n?: unknown } }).bytes_n;
    if (bytesN !== undefined) {
      const bytes = toBytes(value);
      if (bytes !== undefined && (typeof bytesN.n !== "number" || bytes.length === bytesN.n)) {
        return bytes;
      }
    }
  }

  return value;
}

function functionInputs(spec: unknown, name: string): readonly unknown[] {
  const getFunc = (spec as { getFunc?: unknown } | null)?.getFunc;
  if (typeof getFunc !== "function") return [];

  let fn: unknown;
  try {
    fn = (getFunc as (value: string) => unknown).call(spec, name);
  } catch {
    return [];
  }

  const inputs = readValue<unknown[]>((fn as { inputs?: unknown } | null)?.inputs);
  if (!Array.isArray(inputs)) return [];

  return inputs.map((input) => readValue<unknown>((input as { type?: unknown } | null)?.type));
}

function normalizeArgs(
  spec: unknown,
  descriptor: Descriptor,
  inputTypes: readonly unknown[],
  args: readonly unknown[],
): unknown[] {
  if (inputTypes.length === 0) return [...args];

  const named = args[0];
  if (named === null || typeof named !== "object" || Array.isArray(named)) return [...args];

  const copy: Record<string, unknown> = { ...(named as Record<string, unknown>) };
  descriptor.entries.forEach((entry, index) => {
    const type = inputTypes[index];
    if (type === undefined) return;
    if (!(entry.name in copy)) return;
    copy[entry.name] = normalizeArg(copy[entry.name], type, spec);
  });

  return [copy, ...args.slice(1)];
}

export type CallAnnouncer = (
  method: string,
  phase: "calling" | "signing" | "done" | "failed",
) => void;

let callSequence = 0;

export function resolveCalls(
  contract: object,
  spec: readonly Descriptor[],
  announce?: CallAnnouncer,
): object {
  const source = contract as Record<string, unknown> & { spec?: unknown };
  const wrapped = Object.create(source) as Record<string, unknown>;

  for (const descriptor of spec) {
    const { name } = descriptor;
    const method = source[name];
    if (typeof method !== "function") continue;

    wrapped[name] = async (...args: unknown[]) => {
      const id = ++callSequence;
      const tell: CallAnnouncer = (called, phase) => {
        try {
          announce?.(called, phase);
        } catch {
          void 0;
        }
      };

      tell(name, "calling");
      emit({ type: "call", id, method: name, kind: "call", outcome: "pending", at: Date.now() });

      const normalized = normalizeArgs(
        source.spec,
        descriptor,
        functionInputs(source.spec, name),
        args,
      );
      let tx: unknown;
      try {
        tx = await (method as (...a: unknown[]) => Promise<unknown>).apply(source, normalized);
      } catch (error) {
        emit({ type: "call", id, method: name, kind: "call", outcome: "failed", failure: failureOf(error), at: Date.now() });
        tell(name, "failed");
        throw playerError(name, error);
      }

      if (tx === null || typeof tx !== "object") {
        emit({ type: "call", id, method: name, kind: "call", outcome: "accepted", at: Date.now() });
        tell(name, "done");
        return tx;
      }

      const call = tx as Transaction;
      if (call.isReadCall === true) {
        emit({ type: "call", id, method: name, kind: "read", outcome: "accepted", at: Date.now() });
        tell(name, "done");
        return call.result;
      }
      if (typeof call.signAndSend !== "function") {
        emit({ type: "call", id, method: name, kind: "call", outcome: "accepted", at: Date.now() });
        tell(name, "done");
        return tx;
      }

      tell(name, "signing");
      emit({ type: "call", id, method: name, kind: "write", outcome: "pending", at: Date.now() });

      try {
        const sent = await (call.signAndSend as () => Promise<Transaction>).call(call);
        emit({ type: "call", id, method: name, kind: "write", outcome: "accepted", at: Date.now() });
        tell(name, "done");
        return sent?.result;
      } catch (error) {
        emit({ type: "call", id, method: name, kind: "write", outcome: "failed", failure: failureOf(error), at: Date.now() });
        tell(name, "failed");
        throw playerError(name, error);
      }
    };
  }

  return wrapped;
}

function signature(d: Descriptor): string {
  const args = d.entries.map((e) => `${e.name}: ${e.kind}`).join(", ");
  const returns = d.outputs.length > 0 ? `: ${d.outputs.join(" | ")}` : "";
  return `${d.name}(${args})${returns}`;
}

function namedCall(d: Descriptor): string {
  const args = d.entries.map((e) => `${e.name}: <${e.kind}>`).join(", ");
  return `${d.name}({ ${args} })`;
}

function helpBlock(writes: (t: string) => void): (o: Options) => void {
  return (o) => {
    const sample = o.spec.find((d) => d.entries.length > 0);
    const lines: string[] = [
      "",
      "  BREAKER — objects available in the console",
      "",
      `    window.player      ${o.player}`,
      "                       your address",
      `    window.instance    ${o.instance}`,
      "                       this instance's contract, yours alone",
      "    window.contract    Client",
      "                       the contract above, with the methods listed below",
      ...(o.aux === undefined
        ? []
        : [
            `    window.aux         ${o.aux}`,
            "                       the level's auxiliary contract, when it has one",
          ]),
      "    window.help()      this message",
      "",
      "  How to call",
      "",
      "    await window.contract.count()      // read — answers with the value",
      "    await window.contract.increment()  // write — sent when you call it",
      "",
      ...(sample === undefined
        ? []
        : [
            "    arguments go by name, in one object:",
            `    await window.contract.${namedCall(sample)}`,
            "",
          ]),
      "  Argument shapes",
      "",
      "    union:  { tag: \"Variant\", values: [args...] }",
      "    bytes:  Uint8Array, a number array, or a hex string",
      "",
      "  Contract methods",
      "",
    ];

    if (o.spec.length === 0) {
      lines.push("    (the spec returned no methods)", "");
    }

    for (const d of o.spec) {
      lines.push(`    window.contract.${signature(d)}`);
      if (d.doc) {
        for (const line of d.doc.trim().split("\n")) {
          lines.push(`        ${line}`);
        }
      }
      lines.push("");
    }

    writes(lines.join("\n"));
  };
}

export function mountGlobals(target: GlobalRegistry, o: Options): () => void {
  const writes = o.writes ?? ((t: string) => console.log(t));
  const help = helpBlock(writes);

  target["player"] = o.player;
  target["instance"] = o.instance;
  target["contract"] = o.contract;
  target["aux"] = o.aux;
  target["help"] = () => help(o);

  return () => {
    for (const name of GLOBAL_NAMES) delete target[name];
  };
}

export function mountWithoutInstance(
  target: GlobalRegistry,
  writes?: (text: string) => void,
): () => void {
  const print = writes ?? ((t: string) => console.log(t));

  target["player"] = undefined;
  target["instance"] = undefined;
  target["contract"] = undefined;
  target["aux"] = undefined;
  target["help"] = () =>
    print(
      [
        "",
        "  BREAKER — you don't have an instance yet.",
        "",
        "  Open a level on the page and click \"New instance\". The core",
        "  deploys a fresh contract, yours alone, and these objects show up here:",
        "",
        "    window.player      your address",
        "    window.instance    your instance's contract",
        "    window.contract    the contract, with its methods",
        "    window.help()      this message",
        "",
      ].join("\n"),
    );

  return () => {
    for (const name of GLOBAL_NAMES) delete target[name];
  };
}
