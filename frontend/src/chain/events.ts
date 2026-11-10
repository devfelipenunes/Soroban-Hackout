export type CallKind = "read" | "write" | "call";

export type CallOutcome = "pending" | "accepted" | "failed";

export type CallFailure = "rejected" | "cancelled" | "unknown";

export type CallEvent = {
  type: "call";
  id: number;
  method: string;
  kind: CallKind;
  outcome: CallOutcome;
  failure?: CallFailure | undefined;
  at: number;
};

export type LifecycleEvent = {
  type: "instance" | "rejected" | "stuck" | "ledger-ready";
  at: number;
};

export type OsEvent = CallEvent | LifecycleEvent;

type Listener = (event: OsEvent) => void;

const listeners = new Set<Listener>();

export function emit(event: OsEvent): void {
  for (const listener of listeners) listener(event);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
