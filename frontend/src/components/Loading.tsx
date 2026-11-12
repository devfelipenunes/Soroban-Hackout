import type { ReactElement } from "react";

export function Loading({
  label,
  detail,
}: {
  label: string;
  detail?: string;
}): ReactElement {
  return (
    <div className="loading" role="status" aria-live="polite" aria-busy="true">
      <span className="loading__spinner" aria-hidden="true" />
      <span className="loading__label">{label}</span>
      {detail !== undefined && <span className="loading__detail">{detail}</span>}
    </div>
  );
}
