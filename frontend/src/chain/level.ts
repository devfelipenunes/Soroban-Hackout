export type ReadCall<T> = { readonly result: T };

export type CoreReads = {
  instances(input: { player: string; level_id: number }): Promise<ReadCall<readonly string[]>>;
  is_completed(input: { player: string; level_id: number }): Promise<ReadCall<boolean>>;
  can_access(input: { player: string; level_id: number }): Promise<ReadCall<boolean>>;
};

export type LevelReads = {
  readonly instance: string | null;
  readonly completed: boolean;
  readonly accessible: boolean;
};

export type InstanceGate = {
  version: () => number;
  bump: () => void;
  isCurrent: (value: number) => boolean;
};

const READ_ATTEMPTS = 3;
const RETRY_DELAY_MS = 400;

export function createInstanceGate(): InstanceGate {
  let version = 0;

  return {
    version: () => version,
    bump: () => {
      version += 1;
    },
    isCurrent: (value) => value === version,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function retry<T>(call: () => Promise<T>): Promise<T> {
  let last: unknown;

  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      last = error;
      if (attempt + 1 < READ_ATTEMPTS) await delay(RETRY_DELAY_MS);
    }
  }

  throw last;
}

export async function readCompletion(
  client: CoreReads,
  player: string,
  levelId: number,
): Promise<boolean> {
  const verdict = await retry(() => client.is_completed({ player, level_id: levelId }));
  return verdict.result === true;
}

export async function readAccess(
  client: CoreReads,
  player: string,
  levelId: number,
): Promise<boolean> {
  const verdict = await retry(() => client.can_access({ player, level_id: levelId }));
  return verdict.result === true;
}

export async function readLevel(
  client: CoreReads,
  player: string,
  levelId: number,
): Promise<LevelReads> {
  const [list, completed, accessible] = await Promise.all([
    retry(() => client.instances({ player, level_id: levelId })),
    readCompletion(client, player, levelId),
    readAccess(client, player, levelId),
  ]);
  const instances = list.result;
  const last = instances.length > 0 ? instances[instances.length - 1] : undefined;

  return { instance: last ?? null, completed, accessible };
}
