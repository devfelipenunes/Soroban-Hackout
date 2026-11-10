import type { ReactElement } from "react";

export function Clouds(): ReactElement {
  return (
    <div className="clouds" aria-hidden="true">
      <span className="clouds__layer clouds__layer--a" />
      <span className="clouds__layer clouds__layer--b" />
    </div>
  );
}
