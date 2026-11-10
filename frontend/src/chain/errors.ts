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
