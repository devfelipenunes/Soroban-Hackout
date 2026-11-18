export function reasonOf(error: unknown): string {
  const message = errorMessage(error, new Set());
  return message ?? String(error);
}

function errorMessage(error: unknown, seen: Set<object>): string | undefined {
  if (typeof error === "string") return error;
  if (error === null || typeof error !== "object" || seen.has(error)) return undefined;
  seen.add(error);

  const record = error as unknown as Record<string, unknown>;
  const candidates = [record.message, record.reason, record.panic, record.diagnosticEvents, record.events, record.cause];
  for (const candidate of candidates) {
    if (candidate === record.panic && typeof candidate === "string" && candidate.trim() !== "") {
      return candidate;
    }
    if (candidate === record.message && typeof candidate === "string" && candidate.trim() !== "") {
      const nested = candidates.slice(1).map((value) => diagnosticMessage(value, seen)).find(Boolean);
      if (nested !== undefined) return nested;
      return candidate;
    }
    const detail = diagnosticMessage(candidate, seen);
    if (detail !== undefined) return detail;
  }
  return undefined;
}

function diagnosticMessage(value: unknown, seen: Set<object>): string | undefined {
  if (typeof value === "string") {
    const panic = /(?:panic(?:\s+with\s+message)?|contract panic)[:\s"']+([^"'\n]+)["']?/i.exec(value);
    return panic?.[1]?.trim() || undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const detail = errorMessage(item, seen);
      if (detail !== undefined) return detail;
    }
    return undefined;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);
  const record = value as Record<string, unknown>;
  for (const key of ["message", "reason", "panic", "value", "data", "events"]) {
    const detail = diagnosticMessage(record[key], seen);
    if (detail !== undefined) return detail;
  }
  return undefined;
}

export const ERR_LEVEL_NOT_FOUND = 1;
export const ERR_UNKNOWN_INSTANCE = 2;
export const ERR_ALREADY_SOLVED = 3;
export const ERR_OBJECTIVE_NOT_MET = 4;
export const ERR_NOT_INITIALISED = 5;
export const ERR_ACCESS_LOCKED = 6;
export const ERR_INVALID_PREREQUISITE = 7;

export const ERROR_KEYS: Readonly<Record<number, string>> = {
  [ERR_LEVEL_NOT_FOUND]: "error.levelNotFound",
  [ERR_UNKNOWN_INSTANCE]: "error.unknownInstance",
  [ERR_ALREADY_SOLVED]: "error.alreadySolved",
  [ERR_OBJECTIVE_NOT_MET]: "error.objectiveNotMet",
  [ERR_NOT_INITIALISED]: "error.notInitialised",
  [ERR_ACCESS_LOCKED]: "error.accessLocked",
  [ERR_INVALID_PREREQUISITE]: "error.invalidPrerequisite",
};

export function errorKey(code: number | null): string | null {
  if (code === null) return null;
  return ERROR_KEYS[code] ?? null;
}

export function contractErrorCode(error: unknown): number | null {
  const found = /Contract,\s*#(\d+)/.exec(reasonOf(error));
  return found?.[1] ? Number(found[1]) : null;
}
