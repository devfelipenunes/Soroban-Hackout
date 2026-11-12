import { useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { Descriptor } from "../chain/globals.ts";
import { displayValue, type CheckResult } from "../levels/diagnostics.ts";
import { LEVELS, type Level } from "../levels/index.ts";
import { useLanguage } from "../i18n/language.tsx";
import type { Language } from "../i18n/translate.ts";
import {
  expressionFor,
  isSimpleExpression,
  rawFor,
  scalarKind,
  unionExpression,
  variantFor,
  type CaseSubmit,
  type OperationCell,
  type OperationCellRun,
} from "./plan.ts";

type Tab = "plan" | "code" | "target" | "run";

type BreachRoomProps = {
  level: Level | null;
  instance: string | undefined;
  spec: readonly Descriptor[];
  cells: readonly OperationCell[];
  runs: Readonly<Record<string, OperationCellRun>>;
  activeCellId: string;
  runningCellId: string | null;
  runningPlan: boolean;
  submit: CaseSubmit;
  solved: boolean;
  onAddCell: () => void;
  onAddWait: () => void;
  onAddMethod: (descriptor: Descriptor) => void;
  onUpdateCell: (
    cellId: string,
    patch: {
      args?: Record<string, string>;
      variants?: Record<string, string>;
      waitMs?: number;
    },
  ) => void;
  onRemoveCell: (cellId: string) => void;
  onMoveCell: (cellId: string, direction: -1 | 1) => void;
  onRunCell: (cell: OperationCell) => void;
  onRunPlan: () => void;
  onClose: () => void;
  notebook: ReactNode;
};

function Diagnostics({
  results,
  language,
  t,
}: {
  results: readonly CheckResult[];
  language: Language;
  t: (key: string, vars?: Readonly<Record<string, string | number>>) => string;
}): ReactElement {
  return (
    <ul className="device__diagnostics">
      {results.map((item) => (
        <li key={item.id} className={item.ok ? "is-ok" : "is-pending"}>
          <span aria-hidden="true">{item.ok ? "✓" : "✗"}</span>
          <span>{item.label[language] ?? item.label["pt-BR"]}</span>
          {!item.ok && (
            <small>
              {t("level.diagnosticNow", { value: displayValue(item.current) })}
              {" · "}
              {t("level.diagnosticExpected", {
                value: displayValue(item.expected),
              })}
            </small>
          )}
        </li>
      ))}
    </ul>
  );
}

function RunOutput({
  run,
  t,
}: {
  run: OperationCellRun;
  t: (key: string, vars?: Readonly<Record<string, string | number>>) => string;
}): ReactElement {
  if (run.status === "running") {
    return (
      <div className="device__cell-output device__cell-output--running">
        <p className="device__cell-progress" role="status">
          {run.progress ?? t("device.operations.progress.starting")}
        </p>
        <small className="device__cell-elapsed" aria-live="off">
          {t("device.operations.progress.elapsed", {
            elapsed: `${run.elapsedSeconds ?? 0}s`,
            completed: String(run.callsCompleted ?? 0),
            started: String(run.callsStarted ?? 0),
          })}
        </small>
      </div>
    );
  }

  return (
    <div
      className={`device__cell-output device__cell-output--${run.status}`}
      role={run.status === "error" ? "alert" : "status"}
    >
      <span className="device__cell-output-label">
        {run.status === "error"
          ? t("device.operations.failedShort")
          : t("device.operations.output")}
      </span>
      {run.output !== null && <pre>{run.output}</pre>}
    </div>
  );
}

function PlanCard({
  cell,
  descriptor,
  index,
  run,
  active,
  busy,
  locked,
  onUpdateCell,
  onRemoveCell,
  onMoveCell,
  onRunCell,
  onEditCode,
  expressionFields,
  onToggleExpression,
}: {
  cell: OperationCell;
  descriptor: Descriptor | undefined;
  index: number;
  run: OperationCellRun | undefined;
  active: boolean;
  busy: boolean;
  locked: boolean;
  onUpdateCell: BreachRoomProps["onUpdateCell"];
  onRemoveCell: (cellId: string) => void;
  onMoveCell: (cellId: string, direction: -1 | 1) => void;
  onRunCell: (cell: OperationCell) => void;
  onEditCode: () => void;
  expressionFields: Readonly<Record<string, true>>;
  onToggleExpression: (key: string) => void;
}): ReactElement {
  const { t } = useLanguage();
  return (
    <article className={`device__plan-card${active ? " is-active" : ""}`}>
      <header className="device__plan-card-head">
        <span className="device__plan-step">
          {t("device.operations.plan.step", { number: String(index + 1) })}
        </span>
        <strong className="device__plan-method">
          {descriptor?.name ??
            (cell.waitMs !== undefined
              ? t("device.operations.plan.wait")
              : t("device.operations.plan.custom"))}
        </strong>
        <div className="device__plan-actions">
          <button
            type="button"
            className="device__cell-action"
            aria-label={t("device.operations.plan.moveUp")}
            title={t("device.operations.plan.moveUp")}
            disabled={locked}
            onClick={() => onMoveCell(cell.id, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="device__cell-action"
            aria-label={t("device.operations.plan.moveDown")}
            title={t("device.operations.plan.moveDown")}
            disabled={locked}
            onClick={() => onMoveCell(cell.id, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="device__cell-action"
            aria-label={t("device.operations.plan.remove")}
            title={t("device.operations.plan.remove")}
            disabled={locked}
            onClick={() => onRemoveCell(cell.id)}
          >
            ×
          </button>
        </div>
      </header>

      {cell.waitMs !== undefined ? (
        <div className="device__plan-args">
          <label className="device__plan-arg">
            <span>{t("device.operations.plan.waitSeconds")}</span>
            <input
              type="number"
              min="0"
              step="1"
              value={String(Math.round(cell.waitMs / 1000))}
              disabled={locked}
              onChange={(event) =>
                onUpdateCell(cell.id, {
                  waitMs: Math.max(0, Number(event.target.value)) * 1000,
                })
              }
              aria-label={t("device.operations.plan.waitSeconds")}
            />
          </label>
          <pre className="device__plan-preview">{cell.source}</pre>
        </div>
      ) : descriptor !== undefined ? (
        <div className="device__plan-args">
          {descriptor.entries.map((entry) => {
            const variant = variantFor(entry, cell.variants);
            const key = `${cell.id}.${entry.name}`;
            const forced = expressionFields[key] === true;
            const expression = cell.args?.[entry.name] ?? "";
            const scalar = scalarKind(entry.kind);
            const simple = isSimpleExpression(entry.kind, expression) && !forced;
            const raw = rawFor(entry.kind, expression);
            const update = (value: string): void =>
              onUpdateCell(cell.id, {
                args: { [entry.name]: expressionFor(entry.kind, value) },
              });
            return (
              <label className="device__plan-arg" key={entry.name}>
                <span>
                  <span>
                    {entry.name} <small>{entry.kind}</small>
                  </span>
                  <button
                    type="button"
                    className="device__plan-fx"
                    disabled={locked}
                    aria-pressed={forced}
                    onClick={() => onToggleExpression(key)}
                  >
                    {t(
                      forced
                        ? "device.operations.plan.field"
                        : "device.operations.plan.expression",
                    )}
                  </button>
                </span>
                {entry.variants !== undefined && entry.variants.length > 0 && (
                  <select
                    value={variant?.name ?? ""}
                    disabled={locked}
                    onChange={(event) => {
                      const next = entry.variants?.find(
                        (item) => item.name === event.target.value,
                      );
                      onUpdateCell(cell.id, {
                        variants: { [entry.name]: event.target.value },
                        args: {
                          [entry.name]:
                            next === undefined ? "null" : unionExpression(next),
                        },
                      });
                    }}
                  >
                    {entry.variants.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                )}
                {simple && scalar !== "other" ? (
                  scalar === "bool" ? (
                    <select
                      value={raw}
                      disabled={locked}
                      onChange={(event) => update(event.target.value)}
                      aria-label={`${descriptor.name} ${entry.name}`}
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input
                      type={scalar === "integer" ? "number" : "text"}
                      value={raw}
                      disabled={locked}
                      onChange={(event) => update(event.target.value)}
                      placeholder={
                        scalar === "bytes"
                          ? "hex"
                          : scalar === "vec"
                            ? "a, b"
                            : undefined
                      }
                      inputMode={scalar === "integer" ? "numeric" : undefined}
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={`${descriptor.name} ${entry.name}`}
                    />
                  )
                ) : (
                  <input
                    value={expression}
                    disabled={locked}
                    onChange={(event) =>
                      onUpdateCell(cell.id, {
                        args: { [entry.name]: event.target.value },
                      })
                    }
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={`${descriptor.name} ${entry.name}`}
                  />
                )}
                {scalar === "address" && simple && (
                  <div className="device__plan-chips">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => update("window.player")}
                    >
                      {t("device.operations.plan.usePlayer")}
                    </button>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => update("window.aux")}
                    >
                      {t("device.operations.plan.useAux")}
                    </button>
                  </div>
                )}
              </label>
            );
          })}
          <pre className="device__plan-preview">{cell.source}</pre>
        </div>
      ) : (
        <pre className="device__plan-preview">{cell.source}</pre>
      )}

      <div className="device__plan-card-actions">
        <button
          type="button"
          className="device__cell-run"
          disabled={busy || cell.source.trim() === ""}
          onClick={() => onRunCell(cell)}
          aria-busy={run?.status === "running"}
        >
          {run?.status === "running"
            ? t("device.operations.runningShort")
            : t("device.operations.runShort")}
        </button>
        <button
          type="button"
          className="device__link"
          onClick={onEditCode}
        >
          {t("device.operations.plan.editCode")}
        </button>
      </div>
      {run !== undefined && <RunOutput run={run} t={t} />}
    </article>
  );
}

export function BreachRoom(props: BreachRoomProps): ReactElement {
  const { t, language } = useLanguage();
  const [tab, setTab] = useState<Tab>("code");
  const [addOpen, setAddOpen] = useState(false);
  const [expressionFields, setExpressionFields] = useState<
    Record<string, true>
  >({});
  const toggleExpression = (key: string): void =>
    setExpressionFields((previous) => {
      const next = { ...previous };
      if (next[key] === true) delete next[key];
      else next[key] = true;
      return next;
    });
  const position =
    props.level === null
      ? -1
      : LEVELS.findIndex((level) => level.id === props.level?.id);
  const next =
    position >= 0 && position < LEVELS.length - 1
      ? LEVELS[position + 1]
      : undefined;
  const runnable = props.cells.filter((cell) => cell.source.trim() !== "");
  const planCells = props.cells.filter(
    (cell) => cell.source.trim() !== "" || cell.method !== undefined,
  );
  const locked = props.runningPlan || props.runningCellId !== null;
  const methods = props.spec;

  const plan = (): ReactElement => (
    <div className="device__plan">
      {props.instance === undefined && (
        <p className="device__operation-notice" role="status">
          {t("device.operations.noInstanceShort")}
        </p>
      )}
      {planCells.length === 0 ? (
        <p className="device__empty">{t("device.operations.plan.empty")}</p>
      ) : (
        planCells.map((cell, index) => (
          <PlanCard
            key={cell.id}
            cell={cell}
            descriptor={props.spec.find((item) => item.name === cell.method)}
            index={index}
            run={props.runs[cell.id]}
            active={props.activeCellId === cell.id}
            busy={
              props.runningPlan ||
              props.runningCellId !== null ||
              props.instance === undefined
            }
            locked={locked}
            onUpdateCell={props.onUpdateCell}
            onRemoveCell={props.onRemoveCell}
            onMoveCell={props.onMoveCell}
            onRunCell={props.onRunCell}
            onEditCode={() => setTab("code")}
            expressionFields={expressionFields}
            onToggleExpression={toggleExpression}
          />
        ))
      )}
      <div className="device__plan-add">
        <button
          type="button"
          className="device__add-cell"
          disabled={locked}
          onClick={() => setAddOpen((value) => !value)}
        >
          <span aria-hidden="true">＋</span>
          {t("device.operations.plan.add")}
        </button>
        <button
          type="button"
          className="device__add-cell"
          disabled={locked}
          onClick={() => {
            props.onAddCell();
            setTab("code");
          }}
        >
          <span aria-hidden="true">＋</span>
          {t("device.operations.plan.addCustom")}
        </button>
        <button
          type="button"
          className="device__add-cell"
          disabled={locked}
          onClick={props.onAddWait}
        >
          <span aria-hidden="true">＋</span>
          {t("device.operations.plan.addWait")}
        </button>
      </div>
      {addOpen && (
        <section className="device__plan-picker">
          {methods.length === 0 ? (
            <p className="device__method-empty">
              {t("device.operations.noMethodsShort")}
            </p>
          ) : (
            <div className="device__method-list">
              {methods.map((descriptor) => (
                <article className="device__method" key={descriptor.name}>
                  <div className="device__method-copy">
                    <code>{descriptor.name}</code>
                    {descriptor.doc && <p>{descriptor.doc}</p>}
                    <span>
                      {descriptor.entries.length === 0
                        ? t("device.operations.noArguments")
                        : descriptor.entries
                            .map((entry) => `${entry.name}: ${entry.kind}`)
                            .join(" · ")}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="device__method-insert"
                    disabled={locked}
                    onClick={() => {
                      props.onAddMethod(descriptor);
                      setAddOpen(false);
                    }}
                  >
                    {t("device.operations.plan.addMethod")}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      <button
        type="button"
        className="device__plan-run"
        disabled={
          props.instance === undefined ||
          props.runningPlan ||
          props.runningCellId !== null ||
          runnable.length === 0
        }
        onClick={() => {
          props.onRunPlan();
          setTab("run");
        }}
      >
        {props.runningPlan
          ? t("device.operations.plan.running")
          : t("device.operations.plan.run")}
      </button>
    </div>
  );

  const target = (): ReactElement => (
    <div className="device__target">
      <section className="device__target-summary">
        <span>{t("device.operations.target.instance")}</span>
        <code>{props.instance ?? "—"}</code>
      </section>
      <section>
        <h3 className="device__group-label">
          {t("device.operations.target.state")}
        </h3>
        {props.submit.diagnosticsLoading ? (
          <p className="device__note" role="status">
            {t("level.diagnosticLoading")}
          </p>
        ) : props.submit.diagnosticsFailed ? (
          <p className="device__note" role="alert">
            {t("level.diagnosticError")}
          </p>
        ) : props.submit.diagnostics === null ? (
          <p className="device__empty">
            {t("device.operations.target.noState")}
          </p>
        ) : (
          <Diagnostics
            results={props.submit.diagnostics}
            language={language}
            t={t}
          />
        )}
        <button
          type="button"
          className="device__method-insert"
          disabled={props.instance === undefined || props.submit.diagnosticsLoading}
          onClick={props.submit.onRefreshDiagnostics}
        >
          {t("device.operations.target.refresh")}
        </button>
      </section>
      <section>
        <h3 className="device__group-label">
          {t("device.operations.methods")}
        </h3>
        {props.spec.length === 0 ? (
          <p className="device__method-empty">
            {t("device.operations.noMethodsShort")}
          </p>
        ) : (
          <div className="device__method-list">
            {props.spec.map((descriptor) => (
              <article className="device__method" key={descriptor.name}>
                <div className="device__method-copy">
                  <code>{descriptor.name}</code>
                  {descriptor.doc && <p>{descriptor.doc}</p>}
                  <span>
                    {descriptor.entries.length === 0
                      ? t("device.operations.noArguments")
                      : descriptor.entries
                          .map((entry) => `${entry.name}: ${entry.kind}`)
                          .join(" · ")}
                  </span>
                  {descriptor.outputs.length > 0 && (
                    <small>
                      {t("device.operations.returns", {
                        types: descriptor.outputs.join(" · "),
                      })}
                    </small>
                  )}
                </div>
                <button
                  type="button"
                  className="device__method-insert"
                  disabled={locked}
                  onClick={() => props.onAddMethod(descriptor)}
                >
                  {t("device.operations.target.add")}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const run = (): ReactElement => (
    <div className="device__run">
      <section>
        <h3 className="device__group-label">
          {t("device.operations.run.title")}
        </h3>
        {runnable.length === 0 ? (
          <p className="device__empty">{t("device.operations.run.empty")}</p>
        ) : (
          <div className="device__run-steps">
            {runnable.map((cell, index) => (
              <article className="device__run-step" key={cell.id}>
                <header>
                  <span>
                    {t("device.operations.plan.step", {
                      number: String(index + 1),
                    })}
                  </span>
                  <strong>
                    {cell.method ??
                      (cell.waitMs !== undefined
                        ? t("device.operations.plan.wait")
                        : t("device.operations.plan.custom"))}
                  </strong>
                </header>
                {props.runs[cell.id] === undefined ? (
                  <p className="device__note">
                    {t("device.operations.run.pending")}
                  </p>
                ) : (
                  <RunOutput run={props.runs[cell.id] as OperationCellRun} t={t} />
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {props.solved ? (
        <>
          {props.submit.diagnostics !== null && (
            <Diagnostics
              results={props.submit.diagnostics}
              language={language}
              t={t}
            />
          )}
          <div className="device__actions">
            {next !== undefined && (
              <Link
                className="button"
                to={`/level/${next.id}`}
                onClick={props.onClose}
              >
                {t("device.operations.run.next")}
              </Link>
            )}
            <button
              type="button"
              className="button button--secondary"
              onClick={props.onClose}
            >
              {t("device.close")}
            </button>
          </div>
        </>
      ) : (
        <section className="device__run-submit">
          <button
            type="button"
            className="button"
            disabled={!props.submit.canSubmit || props.instance === undefined}
            aria-busy={props.submit.submitting}
            onClick={() => void props.submit.onSubmit()}
          >
            {props.submit.submitting
              ? t("device.operations.run.validating")
              : t("device.operations.run.validate")}
          </button>
          {props.submit.message !== null && (
            <p
              className={`device__run-message device__run-message--${props.submit.message.tone}`}
              role={props.submit.message.tone === "error" ? "alert" : "status"}
            >
              {props.submit.message.text}
            </p>
          )}
          {props.submit.diagnostics !== null && (
            <>
              <h4 className="device__group-label">
                {t("device.operations.run.diagnostics")}
              </h4>
              <Diagnostics
                results={props.submit.diagnostics}
                language={language}
                t={t}
              />
            </>
          )}
          <button
            type="button"
            className="device__link"
            disabled={
              props.instance === undefined || props.submit.diagnosticsLoading
            }
            onClick={props.submit.onRefreshDiagnostics}
          >
            {t("device.operations.target.refresh")}
          </button>
        </section>
      )}
    </div>
  );

  return (
    <div className="device__operations device__breach">
      {tab === "plan" && plan()}
      {tab === "code" && <div className="device__code-view">{props.notebook}</div>}
      {tab === "target" && target()}
      {tab === "run" && run()}
    </div>
  );
}
