import type { ReactElement } from "react";

export function Smoke(): ReactElement {
  return (
    <div className="smoke" aria-hidden="true">
      <span className="smoke__layer smoke__layer--a" />
      <span className="smoke__layer smoke__layer--b" />
      <span className="smoke__layer smoke__layer--c" />
    </div>
  );
}
