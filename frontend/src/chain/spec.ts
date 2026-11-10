import type { Descriptor, Entry } from "./globals.ts";

const CONSTRUCTOR = "__constructor";

const LABELS: Readonly<Record<string, string>> = {
  address: "Address",
  string: "String",
  symbol: "Symbol",
  bytes: "Bytes",
  vec: "Vec",
  option: "Option",
  map: "Map",
  tuple: "Tuple",
  udt: "Udt",
  val: "Val",
};

function label(key: string): string {
  return LABELS[key] ?? key;
}

function read<T>(value: unknown, receiver?: unknown): T | undefined {
  if (typeof value === "function") {
    try {
      return (value as () => T).call(receiver);
    } catch {
      return undefined;
    }
  }
  return value as T | undefined;
}

function toJson(value: unknown): unknown {
  const raw = read<unknown>(value);
  if (raw === null || typeof raw !== "object") return raw;

  const toJSON = (raw as { toJSON?: unknown }).toJSON;
  if (typeof toJSON !== "function") return raw;

  try {
    return (toJSON as () => unknown).call(raw);
  } catch {
    return raw;
  }
}

function text(value: unknown): string | undefined {
  const raw = read<unknown>(value);
  if (typeof raw === "string") return raw === "" ? undefined : raw;
  if (raw === null || raw === undefined || typeof raw !== "object") return undefined;

  const rendered = String(raw);
  return rendered === "" || rendered === "[object Object]" ? undefined : rendered;
}

function typeName(kind: unknown): string {
  const json = toJson(kind);

  if (typeof json === "string") return json === "" ? "?" : label(json);

  if (json !== null && typeof json === "object") {
    const shape = json as Record<string, unknown>;
    const keys = Object.keys(shape);
    const key = keys.length === 1 ? keys[0] : undefined;

    if (key !== undefined) {
      const body = shape[key] as Record<string, unknown> | null | undefined;

      if (key === "bytes_n") return `BytesN<${String(body?.["n"] ?? "?")}>`;

      const element = body?.["element_type"];
      if (element !== undefined) return `${label(key)}<${typeName(element)}>`;

      const ok = body?.["ok_type"];
      if (ok !== undefined) return `Result<${typeName(ok)}, ${typeName(body?.["error_type"])}>`;

      return label(key);
    }
  }

  return "?";
}

function entriesOf(raw: unknown, receiver: unknown): Entry[] {
  const list = read<unknown[]>(raw, receiver);
  if (!Array.isArray(list)) return [];

  return list.map((item) => ({
    name: text((item as { name?: unknown } | null)?.name) ?? "?",
    kind: typeName((item as { type?: unknown } | null)?.type),
  }));
}

export function descriptorsFromSpec(spec: unknown): Descriptor[] {
  if (!spec) return [];

  const withFuncs = spec as { funcs?: unknown };
  const listed = read<unknown[]>(withFuncs.funcs, withFuncs);
  const raw = listed ?? (Array.isArray(spec) ? spec : []);
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((f) => {
    const name = text((f as { name?: unknown } | null)?.name);
    if (name === undefined || name === CONSTRUCTOR) return [];

    const outputs = read<unknown[]>((f as { outputs?: unknown } | null)?.outputs, f);

    return [
      {
        name,
        doc: text((f as { doc?: unknown } | null)?.doc),
        entries: entriesOf((f as { inputs?: unknown } | null)?.inputs, f),
        outputs: Array.isArray(outputs) ? outputs.map(typeName) : [],
      },
    ];
  });
}
