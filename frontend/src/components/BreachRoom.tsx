import type { ReactElement, ReactNode } from "react";

export function BreachRoom({ notebook }: { notebook: ReactNode }): ReactElement {
  return <div className="device__operations device__breach">{notebook}</div>;
}
