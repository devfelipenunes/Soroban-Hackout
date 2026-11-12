import type { Descriptor, Entry, Variant } from "../chain/globals.ts";
import type { CheckResult } from "../levels/diagnostics.ts";

export type CaseSubmit = {
  onSubmit: () => Promise<void>;
  submitting: boolean;
  canSubmit: boolean;
  message: { tone: "ok" | "error" | "notice"; text: string } | null;
  diagnostics: readonly CheckResult[] | null;
  diagnosticsLoading: boolean;
  diagnosticsFailed: boolean;
  onRefreshDiagnostics: () => void;
};

export type ScalarKind =
  | "string"
  | "address"
  | "integer"
  | "bool"
  | "bytes"
  | "vec"
  | "other";

export function scalarKind(kind: string): ScalarKind {
  const normalized = kind.trim().toLocaleLowerCase();
  if (normalized === "string" || normalized === "symbol") return "string";
  if (normalized === "address") return "address";
  if (/^[ui](8|16|32|64|128|256)$/.test(normalized)) return "integer";
  if (normalized === "bool") return "bool";
  if (normalized === "bytes" || normalized.startsWith("bytesn<")) return "bytes";
  if (normalized.startsWith("vec<")) return "vec";
  return "other";
}

function vecElement(kind: string): string {
  const match = kind.trim().match(/^vec<(.+)>$/i);
  return match?.[1] ?? "";
}

export function expressionFor(kind: string, value: string): string {
  const scalar = scalarKind(kind);
  const raw = value.trim();
  if (scalar === "string") return JSON.stringify(value);
  if (scalar === "address") {
    if (raw === "") return "null";
    if (/^(window\.|await |\(|\[|\{|"|'|null$)/.test(raw)) return raw;
    return JSON.stringify(raw);
  }
  if (scalar === "integer") return raw === "" ? "0" : raw;
  if (scalar === "bool") return raw === "true" ? "true" : "false";
  if (scalar === "bytes") {
    const hex = raw.replace(/^0x/i, "");
    if (hex === "") return "new Uint8Array(0)";
    if (/^[0-9a-f]*$/i.test(hex) && hex.length % 2 === 0) {
      const bytes: number[] = [];
      for (let index = 0; index < hex.length; index += 2) {
        bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
      }
      return `new Uint8Array([${bytes.join(", ")}])`;
    }
    return raw;
  }
  if (scalar === "vec") {
    if (raw === "") return "[]";
    const element = vecElement(kind);
    const items = raw.split(",").map((item) => expressionFor(element, item.trim()));
    return `[${items.join(", ")}]`;
  }
  return value;
}

export function rawFor(kind: string, expression: string): string {
  const scalar = scalarKind(kind);
  const value = expression.trim();
  if (scalar === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === "string" ? parsed : value;
    } catch {
      return value;
    }
  }
  if (scalar === "address") {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === "string" ? parsed : value;
    } catch {
      return value;
    }
  }
  if (scalar === "integer") return /^-?\d+$/.test(value) ? value : "";
  if (scalar === "bool") return value === "true" ? "true" : "false";
  if (scalar === "bytes") {
    const match = value.match(/^new Uint8Array\(\[([^\]]*)\]\)$/);
    if (match?.[1] !== undefined) {
      return match[1]
        .split(",")
        .map((item) => Number.parseInt(item.trim(), 10))
        .filter((item) => Number.isInteger(item) && item >= 0 && item <= 255)
        .map((item) => item.toString(16).padStart(2, "0"))
        .join("");
    }
    return value.replace(/^0x/i, "");
  }
  if (scalar === "vec") {
    if (!value.startsWith("[") || !value.endsWith("]")) return value;
    const element = vecElement(kind);
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => rawFor(element, item.trim()))
      .join(", ");
  }
  return value;
}

export function isSimpleExpression(kind: string, expression: string): boolean {
  const scalar = scalarKind(kind);
  const value = expression.trim();
  if (scalar === "string") return /^"([^"\\]|\\.)*"$/.test(value);
  if (scalar === "address") {
    return (
      /^"([^"\\]|\\.)*"$/.test(value) ||
      value === "null" ||
      value === "window.player" ||
      value === "window.aux"
    );
  }
  if (scalar === "integer") return /^-?\d+$/.test(value);
  if (scalar === "bool") return value === "true" || value === "false";
  if (scalar === "bytes") {
    return /^new Uint8Array\(\[[0-9, ]*\]\)$/.test(value) || /^0x[0-9a-f]*$/i.test(value);
  }
  if (scalar === "vec") return value.startsWith("[") && value.endsWith("]") && !/[{}]/.test(value);
  return false;
}

export type OperationCell = {
  id: string;
  source: string;
  method?: string;
  args?: Record<string, string>;
  variants?: Record<string, string>;
  waitMs?: number;
};

export type OperationCellRun = {
  status: "running" | "error" | "done";
  output: string | null;
  progress?: string;
  startedAt?: number;
  elapsedSeconds?: number;
  callsStarted?: number;
  callsCompleted?: number;
};

export function waitSource(milliseconds: number): string {
  const safe = Math.max(0, Math.round(milliseconds));
  return `await new Promise((resolve) => setTimeout(resolve, ${safe}));`;
}

export function buildCall(
  descriptor: Descriptor,
  args: Readonly<Record<string, string>>,
): string {
  if (descriptor.entries.length === 0) {
    return `return await window.contract.${descriptor.name}();`;
  }
  const list = descriptor.entries
    .map((entry) => `${entry.name}: ${args[entry.name] ?? "null"}`)
    .join(", ");
  return `return await window.contract.${descriptor.name}({ ${list} });`;
}

export function unionExpression(
  variant: Variant,
  value?: string,
): string {
  if (variant.inputs.length === 0) return JSON.stringify(variant.name);
  if (value !== undefined) return `{ ${variant.name}: ${value} }`;
  const values = variant.inputs.map((_, index) => (index === 0 ? '""' : "null"));
  return `{ ${variant.name}: ${values.length === 1 ? values[0] : `[${values.join(", ")}]`} }`;
}

export function variantFor(
  entry: Entry,
  variants: Readonly<Record<string, string>> | undefined,
): Variant | undefined {
  const selected = variants?.[entry.name];
  return entry.variants?.find((variant) => variant.name === selected) ?? entry.variants?.[0];
}

export function updateCellArguments(
  cell: OperationCell,
  descriptor: Descriptor | undefined,
  args: Readonly<Record<string, string>> | undefined,
  variants: Readonly<Record<string, string>> | undefined,
): OperationCell {
  if (descriptor === undefined) return cell;
  const nextArgs = { ...cell.args, ...args };
  const nextVariants = { ...cell.variants, ...variants };
  if (variants !== undefined) {
    for (const entry of descriptor.entries) {
      if (args?.[entry.name] !== undefined) continue;
      const variant = variantFor(entry, nextVariants);
      if (variant !== undefined) {
        nextArgs[entry.name] = unionExpression(variant, nextArgs[entry.name]);
      }
    }
  }
  return {
    ...cell,
    method: descriptor.name,
    args: nextArgs,
    variants: nextVariants,
    source: buildCall(descriptor, nextArgs),
  };
}
