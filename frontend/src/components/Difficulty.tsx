import type { ReactElement } from "react";

export const TOTAL = 5;

export function Difficulty({ value }: { value: number }): ReactElement {
  const filled = Math.max(0, Math.min(TOTAL, Math.round(value)));

  return (
    <span
      className="difficulty"
      role="img"
      aria-label={`${filled}/${TOTAL}`}
      title={`${filled}/${TOTAL}`}
    >
      {Array.from({ length: TOTAL }, (_, i) => (
        <span
          key={i}
          className={
            i < filled ? "difficulty__dot difficulty__dot--filled" : "difficulty__dot"
          }
        />
      ))}
    </span>
  );
}
