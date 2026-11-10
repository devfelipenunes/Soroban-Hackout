
const LEGACY_PREFIX = "brecha";
const CURRENT_PREFIX = "breaker";

function safeStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function migrateLegacyStorage(storage: Storage | undefined = safeStorage()): number {
  if (storage === undefined) return 0;

  try {
    const legacyKeys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key === null) continue;
      if (
        key === LEGACY_PREFIX ||
        key.startsWith(`${LEGACY_PREFIX}.`) ||
        key.startsWith(`${LEGACY_PREFIX}:`)
      ) {
        legacyKeys.push(key);
      }
    }

    for (const key of legacyKeys) {
      const next = `${CURRENT_PREFIX}${key.slice(LEGACY_PREFIX.length)}`;
      const value = storage.getItem(key);
      if (value === null) continue;
      if (storage.getItem(next) === null) storage.setItem(next, value);
      storage.removeItem(key);
    }

    return legacyKeys.length;
  } catch {
    return 0;
  }
}
