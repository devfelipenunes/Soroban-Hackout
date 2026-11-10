import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  ERR_ACCESS_LOCKED,
  ERR_ALREADY_SOLVED,
  ERR_OBJECTIVE_NOT_MET,
  contractErrorCode,
  errorKey,
  reasonOf,
} from "../chain/errors.ts";
import { latestLedger, ledgersUntil, readClock, secondsFor } from "../chain/ledger.ts";
import {
  displayValue,
  readDiagnostics,
  type Callable,
  type CheckResult,
} from "../levels/diagnostics.ts";
import { useAccount } from "../chain/account.tsx";
import { coreClient, coreReader, instanceClient } from "../chain/core.ts";
import { emit } from "../chain/events.ts";
import { auxId } from "../chain/network.ts";
import { clearSeasonCache } from "../game/season.ts";
import { readAccess, readLevel, createInstanceGate } from "../chain/level.ts";
import {
  mountGlobals,
  mountWithoutInstance,
  resolveCalls,
  type GlobalRegistry,
} from "../chain/globals.ts";
import { descriptorsFromSpec } from "../chain/spec.ts";
import { useWallet } from "../wallet/context.tsx";
import { AccountNotice } from "../components/AccountNotice.tsx";
import type { OsFocus } from "../components/BreakerDevice.tsx";
import { LevelHero } from "../components/LevelHero.tsx";
import { ThreadStrip } from "../components/ThreadStrip.tsx";
import { Markdown } from "../components/Markdown.tsx";
import { Gate } from "../components/Gate.tsx";
import { useCopy } from "../components/copy.ts";
import { useLanguage } from "../i18n/language.tsx";
import { COOLDOWN_MS, createFlag } from "../game/flag.ts";
import { useProgress } from "../game/progress.tsx";
import {
  LEVELS,
  choose,
  levelById,
  levelCode,
  loadLevel,
  type Level as LevelType,
  type LevelContent,
} from "../levels/index.ts";
import { useCaseNarrative } from "../levels/useCaseNarrative.ts";
import { NotFound } from "./NotFound.tsx";

type Message = {
  tone: "ok" | "error" | "notice";
  text: string;
  link?: { to: string; label: string } | undefined;
  retry?: boolean | undefined;
};

const BreakerDevice = lazy(() =>
  import("../components/BreakerDevice.tsx").then(({ BreakerDevice: Component }) => ({
    default: Component,
  })),
);
const Code = lazy(() =>
  import("../components/Code.tsx").then(({ Code: Component }) => ({ default: Component })),
);

export function Level(): ReactElement {
  const { levelId } = useParams();
  const wallet = useWallet();
  const id = Number(levelId);
  const level = Number.isInteger(id) ? levelById(id) : undefined;

  if (!level) return <NotFound />;

  return <Page key={`${level.id}:${wallet.address ?? "anon"}`} level={level} />;
}

function Page({ level }: { level: LevelType }): ReactElement {
  const { pathname, state: navigationState } = useLocation();
  const navigate = useNavigate();
  const openConversation = typeof navigationState === "object" && navigationState !== null && "breakerConversation" in navigationState && navigationState.breakerConversation === true;
  const { t, language } = useLanguage();
  const wallet = useWallet();
  const { ready: accountReady, busy: accountBusy } = useAccount();
  const { markSolved } = useProgress();
  const [confirmed, setConfirmed] = useState(false);
  const [accessible, setAccessible] = useState<boolean | null>(null);

  const [instance, setInstance] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [gate, setGate] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [content, setContent] = useState<LevelContent | null>(null);
  const [previousProof, setPreviousProof] = useState<{ player: string; completed: boolean } | null>(null);
  const [readAttempt, setReadAttempt] = useState(0);
  const [callable, setCallable] = useState<Callable | null>(null);
  const [diagnostics, setDiagnostics] = useState<CheckResult[] | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsFailed, setDiagnosticsFailed] = useState(false);
  const [ledger, setLedger] = useState<{
    latest: number;
    target: number;
    current: number;
  } | null>(null);
  const [osOpen, setOsOpen] = useState(false);
  const [osFocus, setOsFocus] = useState<OsFocus | null>(null);
  const osDialog = useRef<HTMLDialogElement | null>(null);
  const { copied, copy } = useCopy();

  useEffect(() => {
    const open = (): void => {
      setOsOpen(true);
      setOsFocus({ app: "home", at: Date.now() });
    };
    const toggle = (): void => setOsOpen((previous) => !previous);
    window.addEventListener("breaker:open-os", open);
    window.addEventListener("breaker:toggle-os", toggle);
    return () => {
      window.removeEventListener("breaker:open-os", open);
      window.removeEventListener("breaker:toggle-os", toggle);
    };
  }, []);

  useEffect(() => {
    if (!openConversation) return;
    setOsOpen(true); setOsFocus({ app: "comms", at: Date.now() });
    navigate(pathname, { replace: true, state: null });
  }, [openConversation, navigate, pathname]);

  useEffect(() => {
    const dialog = osDialog.current;
    if (!dialog) return;
    if (osOpen && !dialog.open) dialog.showModal();
    if (!osOpen && dialog.open) dialog.close();
  }, [osOpen]);

  const flag = useRef(createFlag());
  const timer = useRef<number | null>(null);
  const rejections = useRef(0);
  const instanceGate = useRef(createInstanceGate());
  const ledgerSignal = useRef<string | null>(null);

  const solved = confirmed;
  const position = LEVELS.findIndex((entry) => entry.id === level.id);
  const next = position < 0 ? undefined : LEVELS[position + 1];
  const previous = position > 0 ? LEVELS[position - 1] : undefined;
  const previousCompleted = previousProof?.player === wallet.address && previousProof?.completed === true;
  const name = choose(level.name, language);
  const summary = choose(level.summary, language);
  const statement = content === null ? null : choose(content.statement, language);
  const conclusion = content === null ? null : choose(content.conclusion, language);
  const briefing =
    statement === null || level.id === 0
      ? statement?.text ?? null
      : statement.text.split(/^## .+$/m)[0]?.trim() ?? null;
  const caseFile = content?.caseFile ?? null;

  const address = wallet.address;
  const signer = wallet.signer;
  const testOnly = wallet.testOnly;

  const caseNarrative = useCaseNarrative(
    content?.narrative ?? null,
    address ?? undefined,
    level.id,
    solved,
    previousCompleted,
    instance !== null,
  );

  const client = useMemo(
    () => (testOnly || !address || !signer ? null : coreClient(address, signer)),
    [address, signer, testOnly],
  );
  const reader = useMemo(() => coreReader(), [readAttempt]);

  useEffect(() => {
    if (!address || !previous) return;
    let alive = true;
    void reader.then((core) => core.is_completed({ player: address, level_id: previous.id })).then((result) => {
      if (alive) setPreviousProof({ player: address, completed: result.result === true });
    }).catch(() => {
      if (alive) setPreviousProof({ player: address, completed: false });
    });
    return () => { alive = false; };
  }, [reader, address, previous]);

  useEffect(() => {
    if (!address) {
      setInstance(null);
      return;
    }

    let alive = true;
    const version = instanceGate.current.version();

    void (async () => {
      try {
        const reads = await readLevel(await reader, address, level.id);
        if (!alive) return;

        if (instanceGate.current.isCurrent(version) && reads.instance !== null) {
          setInstance(reads.instance);
        }

        setConfirmed(reads.completed);
        setAccessible(reads.accessible);
        if (reads.completed) markSolved(level.id);
      } catch (error) {
        if (!alive) return;
        setMessage({
          tone: "error",
          text: t("level.readFailed", { reason: reasonOf(error) }),
          retry: true,
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, [reader, address, level.id, markSolved, t, readAttempt]);

  useEffect(() => {
    let alive = true;

    void loadLevel(level).then((loaded) => {
      if (alive) setContent(loaded);
    });

    return () => {
      alive = false;
    };
  }, [level]);

  useEffect(() => {
    const target = window as unknown as GlobalRegistry;

    if (!instance || !address || !signer) {
      setCallable(null);
      return mountWithoutInstance(target);
    }

    let alive = true;
    let unmount: (() => void) | null = null;

    void (async () => {
      try {
        const contract = await instanceClient(instance, address, signer);
        if (!alive) return;

        const spec = descriptorsFromSpec(contract.spec);
        const resolved = resolveCalls(contract, spec, (method, phase) => {
          console.info(`[breaker] ${method} — ${phase}`);
        });

        unmount = mountGlobals(target, {
          player: address,
          instance,
          contract: resolved,
          spec,
          aux: auxId(level),
        });
        setCallable(resolved as Callable);
      } catch {
        if (alive) unmount = mountWithoutInstance(target);
      }
    })();

    return () => {
      alive = false;
      unmount?.();
      setCallable(null);
    };
  }, [instance, address, signer, level]);

  useEffect(() => {
    if (!callable || (level.id !== 9 && level.id !== 10 && level.id !== 12)) {
      setLedger(null);
      ledgerSignal.current = null;
      return;
    }

    let alive = true;

    const read = async (): Promise<void> => {
      try {
        const latest = await latestLedger();
        const clock = await readClock(callable, level.id, latest);

        if (!alive) return;
        setLedger(clock);
        if (clock !== null && clock.current >= clock.target) {
          const signal = `${instance ?? "none"}:${clock.target}`;
          if (ledgerSignal.current !== signal) {
            ledgerSignal.current = signal;
            emit({ type: "ledger-ready", at: Date.now() });
          }
        }
      } catch {
        if (alive) setLedger(null);
      }
    };

    void read();
    const timer = window.setInterval(() => {
      void read();
    }, 5000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [callable, instance, level.id]);

  useEffect(() => {
    if (solved && !level.revealCode) setCodeOpen(true);
  }, [solved, level.revealCode]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const lock = useCallback(() => {
    flag.current.mark();
    setLocked(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLocked(false), COOLDOWN_MS);
  }, []);

  const createInstance = useCallback(async () => {
    if (testOnly) {
      setMessage({ tone: "notice", text: t("level.localTestWallet") });
      return;
    }

    if (!client || !address) {
      setGate(true);
      return;
    }

    if (!accountReady) {
      setMessage({ tone: "notice", text: t("account.wait") });
      return;
    }

    setCreating(true);
    setMessage(null);
    setDiagnostics(null);

    try {
      const allowed = await readAccess(await reader, address, level.id);
      setAccessible(allowed);
      if (!allowed) {
        setMessage({
          tone: "error",
          text: t("error.accessLocked"),
          link: previous
            ? {
                to: `/level/${previous.id}`,
                label: t("level.previousCase", { code: levelCode(previous.id) }),
              }
            : undefined,
        });
        return;
      }

      const tx = await client.create_instance({ player: address, level_id: level.id });
      const sent = await tx.signAndSend();
      instanceGate.current.bump();
      setInstance(sent.result);
      emit({ type: "instance", at: Date.now() });
    } catch (error) {
      const code = contractErrorCode(error);
      const key = errorKey(code);

      if (code === ERR_ACCESS_LOCKED) {
        setMessage({
          tone: "error",
          text: t("error.accessLocked"),
          link: previous
            ? {
                to: `/level/${previous.id}`,
                label: t("level.previousCase", { code: levelCode(previous.id) }),
              }
            : undefined,
        });
      } else if (key !== null) {
        setMessage({ tone: "error", text: t(key) });
      } else {
        setMessage({ tone: "error", text: t("level.error", { reason: reasonOf(error) }) });
      }
    } finally {
      setCreating(false);
    }
  }, [client, reader, address, accountReady, level.id, t, testOnly, previous]);

  const submit = useCallback(async () => {
    if (!flag.current.released()) return;

    if (!client || !instance) {
      setMessage({ tone: "notice", text: t("level.needsInstance") });
      return;
    }

    lock();
    setSubmitting(true);
    setMessage(null);
    setDiagnostics(null);
    setDiagnosticsFailed(false);
    setDiagnosticsLoading(false);

    try {
      const tx = await client.submit_instance({ instance: instance });
      await tx.signAndSend();
      setConfirmed(true);
      markSolved(level.id);
      clearSeasonCache(address ?? undefined);
      setMessage({ tone: "ok", text: t("level.success") });
    } catch (error) {
      const code = contractErrorCode(error);
      const key = errorKey(code);

      if (code === ERR_ALREADY_SOLVED) {
        setConfirmed(true);
        markSolved(level.id);
        clearSeasonCache(address ?? undefined);
        setMessage({ tone: "ok", text: t("level.success") });
      } else if (code === ERR_OBJECTIVE_NOT_MET) {
        rejections.current += 1;
        emit({ type: "rejected", at: Date.now() });
        if (rejections.current === 3) emit({ type: "stuck", at: Date.now() });
        setMessage({ tone: "notice", text: t("level.failure") });
        if (callable && address) {
          setDiagnosticsLoading(true);
          void readDiagnostics(callable, level.id, address)
            .then((results) => setDiagnostics(results))
            .catch(() => {
              setDiagnostics(null);
              setDiagnosticsFailed(true);
            })
            .finally(() => setDiagnosticsLoading(false));
        }
      } else if (code === ERR_ACCESS_LOCKED) {
        setMessage({
          tone: "error",
          text: t("error.accessLocked"),
          link: previous
            ? {
                to: `/level/${previous.id}`,
                label: t("level.previousCase", { code: levelCode(previous.id) }),
              }
            : undefined,
        });
      } else if (key !== null) {
        setMessage({ tone: "error", text: t(key) });
      } else {
        setMessage({ tone: "error", text: t("level.error", { reason: reasonOf(error) }) });
      }
    } finally {
      setSubmitting(false);
    }
  }, [client, instance, level.id, t, lock, markSolved, callable, address, previous]);

  const canSubmit = !submitting && !locked && !solved;
  const codeHeader = solved && !level.revealCode;

  const kind =
    level.id === 0
      ? t("home.prologue")
      : level.id === 5
        ? `${t("home.boss")} I`
        : `${t("home.case")} ${levelCode(level.id)}`;

  return (
    <main id="main-content" className="content">
      <LevelHero
        level={level}
        kind={kind}
        name={name?.text ?? `Caso ${level.id}`}
        summary={summary?.text ?? null}
        lead={content?.caseFile?.lead ?? null}
        player={address ?? undefined}
      />

      <div className="level-layout level-layout--closed">
        <div className="envelope level-layout__main">

        {content !== null && content.missing.length > 0 && (
          <p className="message message--error">
            {t("level.broken", {
              count: content.missing.length,
              files: content.missing.join(", "),
            })}
          </p>
        )}

        {statement?.missing && (
          <p className="notice">
            <span>{t("notice.missingTranslation")}</span>
          </p>
        )}

        {solved && <p className="message message--ok">✓ {t("level.success")}</p>}

        <ThreadStrip
          caseFile={content?.caseFile ?? null}
          player={address ?? undefined}
          instance={instance ?? undefined}
        />

        <section className="box">
          <h2 className="box__title">{t("level.statement")}</h2>
          {briefing && (
            <Markdown
              source={briefing}
              copyCommandLabel={level.id === 0 ? t("level.copyCommand") : undefined}
              onCopyCommand={level.id === 0 ? copy : undefined}
            />
          )}
          {level.id > 0 && caseFile !== null && (
            <div className="level-operation">
              <h3>{t("level.operation.title")}</h3>
              <p>{caseFile.objective[language]}</p>
              <p>{t("level.operation.discovery")}</p>
              <p className="level-operation__question">{caseFile.unknown[0]?.[language]}</p>
            </div>
          )}
        </section>

        {!instance && !solved && (
          <section className="level-start" aria-labelledby="level-start-title">
            <span className="level-start__eyebrow">{t("level.start.eyebrow")}</span>
            <h2 className="level-start__title" id="level-start-title">
              {t("level.start.title")}
            </h2>
            <p className="level-start__body">{t("level.start.body")}</p>
            <ol className="level-start__steps">
              <li>{t("level.start.step.instance")}</li>
              <li>{t("level.start.step.console")}</li>
              <li>{t("level.start.step.submit")}</li>
            </ol>
            {accessible === false && (
              <p className="message message--notice">
                {t("error.accessLocked")}{" "}
                {previous && (
                  <Link to={`/level/${previous.id}`}>
                    {t("level.previousCase", { code: levelCode(previous.id) })}
                  </Link>
                )}
              </p>
            )}
            <button
              type="button"
              className="button level-start__action"
              onClick={() => void createInstance()}
              disabled={creating || accountBusy}
              aria-busy={creating}
            >
              {creating ? t("level.creating") : t("level.start.action")}
            </button>
          </section>
        )}

        {level.id === 4 && (
          <p className="notice notice--operation">{t("level.operation")}</p>
        )}

        {level.id === 0 && (
          <section className="tutorial">
            <h2 className="tutorial__title">{t("level.tutorial.title")}</h2>
            <p>{t("level.tutorial.body")}</p>
            <ol className="tutorial__steps">
              <li>{t("level.tutorial.console")}</li>
              <li>{t("level.tutorial.instance")}</li>
              <li>{t("level.tutorial.call")}</li>
              <li>{t("level.tutorial.submit")}</li>
            </ol>
            <div className="tutorial__commands">
              {[
                "window.help()",
                "await window.contract.count()",
                "await window.contract.increment()",
                "await window.contract.count()",
              ].map((command, index) => (
                <div className="tutorial__command" key={`${index}-${command}`}>
                  <code>{command}</code>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => void copy(command)}
                  >
                    {t("wallet.copy")}
                  </button>
                </div>
              ))}
            </div>
            <p className="tutorial__note">{t("level.tutorial.desktop")}</p>
          </section>
        )}

        <div className="device-chip">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              setOsFocus({ app: "investigation", at: Date.now() });
              setOsOpen(true);
            }}
          >
            {t("device.openDossier")}
          </button>
          <span className="device-chip__note">{t("device.chipNote")}</span>
        </div>

        <section className="box" id="contract">
          <h2 className="box__title">{t("level.contract")}</h2>
          {instance ? (
            <div className="contract-id">
              <span className="contract-id__value">{instance}</span>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => void copy(instance)}
              >
                {t("wallet.copy")}
              </button>
            </div>
          ) : (
            <p className="muted">{t("level.noInstance")}</p>
          )}
          {instance && (
            <p className="level-start__ready">{t("level.start.ready")}</p>
          )}
          {ledger && (
            <p className="ledger-clock">
              {level.id === 9
                ? `${t("ledger.current", { value: ledger.current })} · ${t("ledger.predict")}`
                : ledgersUntil(ledger.target, ledger.latest) > 0
                  ? t("ledger.wait", {
                      count: ledgersUntil(ledger.target, ledger.latest),
                      seconds: secondsFor(ledgersUntil(ledger.target, ledger.latest)),
                    })
                  : t("ledger.ready")}
            </p>
          )}
        </section>

        <AccountNotice />

        <div className="buttons">
          {instance && (
            <button
              type="button"
              className="button"
              onClick={() => void createInstance()}
              disabled={creating || accountBusy}
              aria-busy={creating}
            >
              {creating ? t("level.creating") : t("level.newInstance")}
            </button>
          )}

          <button
            type="button"
            className="button button--secondary"
            onClick={() => void submit()}
            disabled={!canSubmit}
            aria-busy={submitting}
          >
            {submitting ? t("level.submitting") : t("level.submit")}
          </button>

          {solved && next && (
            <Link className="button" to={`/level/${next.id}`}>
              {t("level.next")}
            </Link>
          )}
          {solved && !next && <Link className="button" to="/final">{t("levelHero.continueStory")}</Link>}
        </div>

        {message && (
          <div className={"message message--" + message.tone}>
            <span>{message.text}</span>
            {message.link && (
              <Link className="button button--secondary" to={message.link.to}>
                {message.link.label}
              </Link>
            )}
            {message.retry && (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setMessage(null);
                  setReadAttempt((previous) => previous + 1);
                }}
              >
                {t("level.retry")}
              </button>
            )}
          </div>
        )}

        {diagnosticsLoading && (
          <p className="message message--notice">{t("level.diagnosticLoading")}</p>
        )}

        {diagnosticsFailed && (
          <p className="message message--error">{t("level.diagnosticError")}</p>
        )}

        {diagnostics && diagnostics.length > 0 && (
          <div className="diagnostics">
            <h3 className="diagnostics__title">{t("level.diagnostics")}</h3>
            <ul className="diagnostics__list">
              {diagnostics.map((item) => (
                <li
                  key={item.id}
                  className={
                    "diagnostics__item diagnostics__item--" + (item.ok ? "ok" : "bad")
                  }
                >
                  <span className="diagnostics__mark" aria-hidden="true">
                    {item.ok ? "✓" : "✗"}
                  </span>
                  <span>{item.label[language] ?? item.label["pt-BR"]}</span>
                  {!item.ok && (
                    <span className="diagnostics__value">
                      {t("level.diagnosticNow", {
                        value: displayValue(item.current),
                      })}{" "}
                      ·{" "}
                      {t("level.diagnosticExpected", {
                        value: displayValue(item.expected),
                      })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!solved && level.id <= 2 && (
          <p className="notice">
            <span>{t("level.hint")}</span>
            <Link to="/help">{t("level.seeHelp")}</Link>
          </p>
        )}

        <section className={codeHeader || level.revealCode ? "box box--raw" : "box"} id="source">
          <div className="box__head">
            <h2 className="box__title">{t("level.code")}</h2>
            {codeHeader && (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setCodeOpen((previous) => !previous)}
              >
                {codeOpen ? t("level.hide") : t("level.reveal")}
              </button>
            )}
          </div>
          {content !== null &&
            (level.revealCode || codeOpen ? (
              <Suspense
                fallback={
                  <pre className="code-raw" data-loading="true">
                    <code>{content.source}</code>
                  </pre>
                }
              >
                <Code source={content.source} />
              </Suspense>
            ) : (
              <p className="box__note">
                {level.difficulty === 0
                  ? t("level.hiddenCodeTutorial")
                  : t("level.hiddenCode")}
              </p>
            ))}
        </section>

        {solved && conclusion && (
          <section className="box" id="debrief">
            <h2 className="box__title">{t("level.conclusion")}</h2>
            <Markdown source={conclusion.text} />
          </section>
        )}
        </div>

      </div>

      <dialog
        className="breaker-device-dialog"
        ref={osDialog}
        aria-label="Breaker OS"
        onCancel={() => setOsOpen(false)}
        onClose={() => setOsOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOsOpen(false);
        }}
      >
        {osOpen && (
          <Suspense fallback={<div role="status" aria-busy="true" />}>
            <BreakerDevice
              level={level}
              narrative={content?.narrative ?? null}
              player={address ?? undefined}
              instance={instance ?? undefined}
              caseFile={content?.caseFile ?? null}
              solved={solved}
              open
              onToggle={() => setOsOpen(false)}
              caseState={caseNarrative}
              focus={osFocus}
            />
          </Suspense>
        )}
      </dialog>

      {gate && <Gate onClose={() => setGate(false)} />}
      {copied && <p className="toast">{t("wallet.copied")}</p>}
    </main>
  );
}
