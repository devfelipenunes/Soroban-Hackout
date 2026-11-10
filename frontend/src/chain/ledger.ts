import { RPC_URL } from "./network.ts";

const LEDGER_SECONDS = 5;
const RPC_TIMEOUT_MS = 8000;

type LatestLedger = {
  readonly result?: { readonly sequence?: unknown } | undefined;
  readonly error?: { readonly message?: string } | undefined;
};

export async function latestLedger(): Promise<number> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestLedger" }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`getLatestLedger: HTTP ${response.status}`);
  }

  const body = (await response.json()) as LatestLedger;
  const sequence = body.result?.sequence;

  if (typeof sequence !== "number") {
    throw new Error(body.error?.message ?? "getLatestLedger: no sequence");
  }

  return sequence;
}

export function ledgersUntil(target: number, latest: number): number {
  return Math.max(0, target - latest);
}

export function secondsFor(ledgers: number): number {
  return ledgers * LEDGER_SECONDS;
}

export type Clock = {
  readonly latest: number;
  readonly current: number;
  readonly target: number;
};

export type ReadMethods = Record<
  string,
  ((args?: Record<string, unknown>) => Promise<unknown>) | undefined
>;

export async function readClock(
  callable: ReadMethods,
  levelId: number,
  latest: number,
): Promise<Clock | null> {
  if (levelId !== 9 && levelId !== 10 && levelId !== 12) return null;

  const current =
    levelId === 9 ? Number(await callable["current_sequence"]?.()) : latest;
  const target =
    levelId === 9
      ? current
      : Number(
          await callable["eta"]?.(levelId === 10 ? { op_id: 0 } : undefined),
        );

  if (!Number.isFinite(current) || !Number.isFinite(target)) return null;

  return { latest, current, target };
}
