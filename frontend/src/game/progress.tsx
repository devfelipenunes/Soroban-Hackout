import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Value = {
  solvedIds: ReadonlySet<number>;
  markSolved: (levelId: number) => void;
  reset: () => void;
};

const Context = createContext<Value | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [solvedIds, setSolvedIds] = useState<ReadonlySet<number>>(() => new Set());

  const markSolved = useCallback((levelId: number) => {
    setSolvedIds((previous) => {
      if (previous.has(levelId)) return previous;
      const next = new Set(previous);
      next.add(levelId);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSolvedIds(new Set());
  }, []);

  const value = useMemo<Value>(
    () => ({ solvedIds, markSolved, reset }),
    [solvedIds, markSolved, reset],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useProgress(): Value {
  const value = useContext(Context);
  if (!value) {
    throw new Error("useProgress() was called outside <ProgressProvider>");
  }
  return value;
}
