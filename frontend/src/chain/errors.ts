export function reasonOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
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

// The SDK exposes these as properties; the text fields are XDR strings, so String() reads them.
type ErrorCase = { name: unknown; doc: unknown; value: unknown };
type WithErrorCases = { errorCases?: () => ErrorCase[] };

// The deployed WASM carries no panic text: only `Error(Contract, #N)` reaches the player.
// The meaning of N is read from the contract's own spec (its `#[contracterror]` enum).
export function contractReason(spec: unknown, error: unknown): string | null {
  const code = contractErrorCode(error);
  const cases = (spec as WithErrorCases | null | undefined)?.errorCases;
  if (code === null || typeof cases !== "function") return null;

  try {
    const found = cases.call(spec).find((entry) => Number(entry.value) === code);
    if (!found) return null;
    const doc = String(found.doc);
    return `${String(found.name)} — ${doc === "" ? "no description" : doc}`;
  } catch {
    return null;
  }
}
