import { useCallback, useEffect, useMemo, useState } from "react";

import { coreReader } from "../chain/core.ts";
import { readAccess, readCompletion, type CoreReads } from "../chain/level.ts";
import { CORE_ID, NETWORK } from "../chain/network.ts";
import { LEVELS } from "../levels/index.ts";
import { useWallet } from "../wallet/context.tsx";





export type SeasonStatus = "cached" | "checking" | "no-wallet" | "ready" | "error";

export type SeasonProgress = {
  readonly status: SeasonStatus;
  readonly completed: readonly boolean[];
  readonly accessible: readonly boolean[];
  readonly solved: number;
  readonly pending: number | null;
  readonly reason: string;
  readonly reload: () => void;
};

type CachedSeason = {
  readonly completed: readonly boolean[];
  readonly at: number;
};

const TTL_MS = 60_000;
const STORAGE_TTL_MS = 5 * 60_000;
const cache = new Map<string, CachedSeason>();
const inflight = new Map<string, Promise<readonly boolean[]>>();
const accessCache = new Map<string, { accessible: boolean; at: number }>();
const accessInflight = new Map<string, Promise<boolean>>();
const cacheEpoch = new Map<string, number>();


const cacheScope = `${NETWORK}:${CORE_ID}`;
const cacheKey = (address: string): string => `${cacheScope}:${address}`;
const storageKey = (address: string): string => `breaker.season.v2.${cacheKey(address)}`;
const legacyStorageKey = (address: string): string => `breaker.season.v1.${NETWORK}:${address}`;
const activeStorageKey = `breaker.season.v2.active.${cacheScope}`;





export function activateSeasonCache(address: string): void {
  try {
    const previous = window.localStorage.getItem(activeStorageKey);
    if (previous !== null && previous !== address) {
      clearSeasonCache(previous);
    }
    window.localStorage.setItem(activeStorageKey, address);
  } catch {
    void 0;
  }
}

function isCachedSeason(value: unknown): value is CachedSeason {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { at?: unknown }).at === "number" &&
    Array.isArray((value as { completed?: unknown }).completed) &&
    (value as { completed: unknown[] }).completed.length === LEVELS.length &&
    (value as { completed: unknown[] }).completed.every((item) => typeof item === "boolean")
  );
}

export function loadStoredSeason(address: string, now = Date.now()): CachedSeason | null {
  try {


    const raw = window.localStorage.getItem(storageKey(address))
      ?? window.localStorage.getItem(legacyStorageKey(address));
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isCachedSeason(parsed) || now - parsed.at >= STORAGE_TTL_MS || parsed.at > now) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveStoredSeason(address: string, cached: CachedSeason): void {
  try {
    if (window.localStorage.getItem(activeStorageKey) !== address) return;
    window.localStorage.setItem(storageKey(address), JSON.stringify(cached));
  } catch {
    void 0;
  }
}

export function clearSeasonCache(address?: string): void {
  if (address === undefined) {
    const keys = new Set([...cache.keys(), ...inflight.keys()]);
    for (const accessKey of [...accessCache.keys(), ...accessInflight.keys()]) {
      const separator = accessKey.lastIndexOf(":");
      if (separator !== -1) keys.add(accessKey.slice(0, separator));
    }
    for (const key of keys) cacheEpoch.set(key, (cacheEpoch.get(key) ?? 0) + 1);
    cache.clear();
    inflight.clear();
    accessCache.clear();
    accessInflight.clear();
    return;
  }

  const key = cacheKey(address);
  cacheEpoch.set(key, (cacheEpoch.get(key) ?? 0) + 1);
  cache.delete(key);
  inflight.delete(key);
  const accessPrefix = `${key}:`;
  for (const accessKey of accessCache.keys()) {
    if (accessKey.startsWith(accessPrefix)) accessCache.delete(accessKey);
  }
  for (const accessKey of accessInflight.keys()) {
    if (accessKey.startsWith(accessPrefix)) accessInflight.delete(accessKey);
  }
  try {
    window.localStorage.removeItem(storageKey(address));
  } catch {
    void 0;
  }
}

export async function readSeason(
  client: CoreReads,
  address: string,
): Promise<readonly boolean[]> {
  const key = cacheKey(address);
  const cached = cache.get(key);
  if (cached !== undefined && Date.now() - cached.at < TTL_MS) return cached.completed;

  const running = inflight.get(key);
  if (running !== undefined) return running;

  const epoch = cacheEpoch.get(key) ?? 0;
  const pending = Promise.all(
    LEVELS.map((level) => readCompletion(client, address, level.id)),
  )
    .then((completed) => {
      const fresh = { completed, at: Date.now() };
      if ((cacheEpoch.get(key) ?? 0) === epoch) {
        cache.set(key, fresh);
        saveStoredSeason(address, fresh);
      }
      return completed;
    })
    .finally(() => {
      if (inflight.get(key) === pending) inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
}

async function readCachedAccess(
  client: CoreReads,
  address: string,
  levelId: number,
): Promise<boolean> {
  const key = `${cacheKey(address)}:${levelId}`;
  const cached = accessCache.get(key);
  if (cached !== undefined && Date.now() - cached.at < TTL_MS) return cached.accessible;
  const running = accessInflight.get(key);
  if (running !== undefined) return running;

  const epoch = cacheEpoch.get(cacheKey(address)) ?? 0;
  const pending = readAccess(client, address, levelId)
    .then((accessible) => {
      if ((cacheEpoch.get(cacheKey(address)) ?? 0) === epoch) {
        accessCache.set(key, { accessible, at: Date.now() });
      }
      return accessible;
    })
    .finally(() => {
      if (accessInflight.get(key) === pending) accessInflight.delete(key);
    });
  accessInflight.set(key, pending);
  return pending;
}

export function useSeasonProgress(): SeasonProgress {
  const wallet = useWallet();
  const address = wallet.address;
  const signer = wallet.signer;

  const [status, setStatus] = useState<SeasonStatus>("checking");
  const [completed, setCompleted] = useState<readonly boolean[]>(() =>
    LEVELS.map(() => false),
  );
  const [accessible, setAccessible] = useState<readonly boolean[]>(() =>
    LEVELS.map(() => false),
  );
  const [reason, setReason] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const client = useMemo(() => (address ? coreReader() : null), [address, nonce]);


  const storedForAddress = useMemo(
    () => (address ? loadStoredSeason(address) : null),
    [address, nonce],
  );

  const reload = useCallback(() => {
    if (address) clearSeasonCache(address);
    setNonce((previous) => previous + 1);
  }, [address]);

  useEffect(() => {
    if (!client || !address || !signer) {
      setStatus("no-wallet");
      return;
    }

    let alive = true;
    activateSeasonCache(address);
    const stored = loadStoredSeason(address);
    if (stored !== null) {
      setCompleted(stored.completed);
      setLoadedFor(address);
      saveStoredSeason(address, stored);
    }
    setAccessible(LEVELS.map(() => false));
    setReason("");
    setStatus(stored === null ? "checking" : "cached");

    void (async () => {
      try {
        const reader = await client;
        const [reads, access] = await Promise.all([
          readSeason(reader, address),
          Promise.all(LEVELS.map((level) => readCachedAccess(reader, address, level.id))),
        ]);
        if (!alive) return;

        setCompleted(reads);
        setAccessible(access);
        setLoadedFor(address);
        setStatus("ready");
      } catch (error) {
        if (!alive) return;
        setReason(error instanceof Error ? error.message : String(error));
        setStatus("error");
      }
    })();

    return () => {
      alive = false;
    };
  }, [client, address, signer, nonce]);

  const solved = completed.filter(Boolean).length;
  const missing = completed.findIndex((value) => !value);
  const pending = missing === -1 ? null : (LEVELS[missing]?.id ?? null);

  if (loadedFor !== address) {
    const snapshot = address ? storedForAddress : null;
    const visibleCompleted = snapshot?.completed ?? LEVELS.map(() => false);
    const visibleSolved = visibleCompleted.filter(Boolean).length;
    const visibleMissing = visibleCompleted.findIndex((value) => !value);
    return {
      status: snapshot !== null ? "cached" : address ? (status === "error" ? "error" : "checking") : "no-wallet",
      completed: visibleCompleted,
      accessible: LEVELS.map(() => false),
      solved: visibleSolved,
      pending: visibleMissing === -1 ? null : (LEVELS[visibleMissing]?.id ?? null),
      reason,
      reload,
    };
  }

  return { status, completed, accessible, solved, pending, reason, reload };
}
