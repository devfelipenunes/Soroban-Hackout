export const COOLDOWN_MS = 2_000;

export type Flag = {
  released: () => boolean;
  mark: () => void;
  remaining: () => number;
};

export function createFlag(
  cooldownMs: number = COOLDOWN_MS,
  now: () => number = () => Date.now(),
): Flag {
  let last = -Infinity;

  return {
    released: () => now() - last >= cooldownMs,
    mark: () => {
      last = now();
    },
    remaining: () => Math.max(0, cooldownMs - (now() - last)),
  };
}
