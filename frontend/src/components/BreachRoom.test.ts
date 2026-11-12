import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { LanguageProvider } from "../i18n/language.tsx";
import { BreachRoom } from "./BreachRoom.tsx";
import type { CaseSubmit, OperationCell } from "./plan.ts";
import type { Descriptor } from "../chain/globals.ts";

const submit: CaseSubmit = {
  onSubmit: async () => {},
  submitting: false,
  canSubmit: true,
  message: null,
  diagnostics: null,
  diagnosticsLoading: false,
  diagnosticsFailed: false,
  onRefreshDiagnostics: () => {},
};

const spec: readonly Descriptor[] = [
  { name: "increment", doc: "Registers the player.", entries: [], outputs: ["u32"] },
];

const cell: OperationCell = {
  id: "cell-1",
  source: "return await window.contract.increment();",
  method: "increment",
  args: {},
  variants: {},
};

function renderWith(
  spec: readonly Descriptor[],
  cells: readonly OperationCell[],
): string {
  return renderToStaticMarkup(
    createElement(
      LanguageProvider,
      null,
      createElement(
        MemoryRouter,
        null,
        createElement(BreachRoom, {
          level: null,
          instance: "CINSTANCE",
          spec,
          cells,
          runs: {},
          activeCellId: cells[0]?.id ?? "cell-1",
          runningCellId: null,
          runningPlan: false,
          submit,
          solved: false,
          onAddCell: () => {},
          onAddWait: () => {},
          onAddMethod: () => {},
          onUpdateCell: () => {},
          onRemoveCell: () => {},
          onMoveCell: () => {},
          onRunCell: () => {},
          onRunPlan: () => {},
          onClose: () => {},
          notebook: createElement("div", null, "NOTEBOOK"),
        }),
      ),
    ),
  );
}

function render(): string {
  return renderWith(spec, [cell]);
}

describe("BreachRoom", () => {
  it("opens directly on notebook cells without tab navigation", () => {
    const html = render();

    expect(html).toContain("NOTEBOOK");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
  });

  it("keeps the notebook visible with an empty operation draft", () => {
    const html = renderWith(spec, []);

    expect(html).toContain("NOTEBOOK");
    expect(html).not.toContain('role="tablist"');
  });
});
