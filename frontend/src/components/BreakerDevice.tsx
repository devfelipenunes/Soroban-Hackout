import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";

import { useLanguage } from "../i18n/language.tsx";
import { TEXTS } from "../i18n/texts.ts";
import { nextLanguage } from "../i18n/translate.ts";
import {
  choose,
  levelCode,
  levelImage,
  loadNarrative,
  loadNews,
  loadStory,
  LEVELS,
  type Level,
} from "../levels/index.ts";
import { useWallet } from "../wallet/context.tsx";
import { useSeasonProgress } from "../game/season.ts";
import { coreClient } from "../chain/core.ts";
import { subscribe } from "../chain/events.ts";
import {
  loadWalletPortfolio,
  loadWalletHistory,
  prepareTokenTransfer,
  signAndSubmitTokenTransfer,
  TokenTransferError,
  TransferSubmissionError,
  type PreparedTransfer,
  type WalletActivity,
  type WalletPortfolio,
} from "../chain/account.tsx";
import { reasonOf } from "../chain/errors.ts";
import type { Descriptor, Entry } from "../chain/globals.ts";
import { useMobileGameplay } from "../platform/viewport.ts";
import { useCopy } from "./copy.ts";
import { BreachRoom } from "./BreachRoom.tsx";
import { ResponsiveImage } from "./ResponsiveImage.tsx";
import { swipeDestination } from "./device-gesture.ts";
import type { OperationCell, OperationCellRun } from "./plan.ts";
import { SeasonClaim } from "./SeasonClaim.tsx";
import { CaseFileBody } from "./CaseFile.tsx";
import { HelpGuide } from "../pages/Help.tsx";
import {
  choiceAnchors,
  conversationBeats,
  availableDialogueReplies,
  sendDialogueReply,
  type ChatExchange,
  type DialogueReply,
  type ContactSpeaker,
  type Narrative,
  type NarrativeDocument,
  type NarrativeChoice,
  type NarrativeText,
  type Speaker,
} from "../levels/narrative.ts";
import type { CaseNarrative } from "../levels/useCaseNarrative.ts";
import type { CaseFile as CaseFileData } from "../levels/casefile.ts";
import type { CaseStory } from "../levels/story.ts";

export type OsAppId =
  | "cases"
  | "comms"
  | "evidence"
  | "operations"
  | "terminal"
  | "story"
  | "help"
  | "collection"
  | "news"
  | "wallet"
  | "investigation";

export type OsFocus = { app: OsAppId | "home"; at: number };

export function requestBreakerOS(): void {
  window.dispatchEvent(new Event("breaker:open-os"));
}

type SystemScreen =
  | "launcher"
  | "controls"
  | "operator"
  | "search"
  | "quick"
  | "settings"
  | "notes"
  | "files"
  | "browser"
  | "scanner"
  | "map";
type View = OsAppId | "home" | SystemScreen;
const SYSTEM_LABELS: Record<SystemScreen, string> = {
  launcher: "device.apps",
  controls: "device.controls",
  operator: "device.operator",
  search: "device.search",
  quick: "device.quick",
  settings: "device.settings",
  notes: "device.notes",
  files: "device.files",
  browser: "device.browser",
  scanner: "device.scanner",
  map: "device.map",
};
const UTILITIES: readonly {
  id: "files" | "browser" | "map" | "settings";
  icon: SystemSymbol;
}[] = [
  { id: "files", icon: "files" },
  { id: "browser", icon: "browser" },
  { id: "map", icon: "files" },
  { id: "settings", icon: "settings" },
];

type Seen = {
  comms: number;
  evidence: number;
  terminal: number;
  investigation: number;
  story: number;
  contacts?: Partial<Record<ContactSpeaker, number>>;
};

type Accent = "amber" | "cyan" | "ivory" | "ash" | "blood";

const SEEN_EMPTY: Seen = {
  comms: 0,
  evidence: 0,
  terminal: 0,
  investigation: 0,
  story: 0,
};

const APPS: readonly { id: OsAppId; labelKey: string; accent: Accent }[] = [
  {
    id: "investigation",
    labelKey: "device.app.cases",
    accent: "amber",
  },
  { id: "operations", labelKey: "device.app.operations", accent: "cyan" },
  { id: "terminal", labelKey: "device.app.terminal", accent: "cyan" },
  { id: "comms", labelKey: "device.app.comms", accent: "cyan" },
  { id: "wallet", labelKey: "device.app.wallet", accent: "cyan" },
  { id: "news", labelKey: "device.app.news", accent: "ivory" },
  { id: "help", labelKey: "device.app.help", accent: "ash" },
];

const APP_IDS = new Set<string>(APPS.map((app) => app.id));

function scrollContainerFor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(".device__home, .device__appbody");
}

function revealEditor(editor: HTMLElement): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  editor.scrollIntoView({
    block: "center",
    behavior: reduced ? "auto" : "smooth",
  });
}

type AsyncScript = () => Promise<unknown>;

function freshOperationCell(): OperationCell {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    source: "",
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function isOperationCell(value: unknown): value is OperationCell {
  if (typeof value !== "object" || value === null) return false;
  const cell = value as {
    id?: unknown;
    source?: unknown;
    method?: unknown;
    args?: unknown;
    variants?: unknown;
    waitMs?: unknown;
  };
  if (typeof cell.id !== "string" || typeof cell.source !== "string") return false;
  if (cell.method !== undefined && typeof cell.method !== "string") return false;
  if (cell.args !== undefined && !isStringRecord(cell.args)) return false;
  if (cell.variants !== undefined && !isStringRecord(cell.variants)) return false;
  if (
    cell.waitMs !== undefined &&
    (typeof cell.waitMs !== "number" ||
      !Number.isFinite(cell.waitMs) ||
      cell.waitMs < 0)
  )
    return false;
  return true;
}

export function operationDraftKey(
  player: string | undefined,
  levelId: number,
  version = 2,
): string {
  return `breaker.mobile-operations.v${version}.${player ?? "anon"}.${levelId}`;
}

export function loadOperationDraft(
  player: string | undefined,
  levelId: number,
): OperationCell[] {
  try {
    const saved = window.localStorage.getItem(
      operationDraftKey(player, levelId),
    );
    if (saved !== null) {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const cells = parsed.filter(isOperationCell);
        if (cells.length > 0) return cells;
      }
    }
    const previousDraft = window.localStorage.getItem(
      operationDraftKey(player, levelId, 1),
    );
    return [{ id: "cell-1", source: previousDraft ?? "" }];
  } catch {
    return [freshOperationCell()];
  }
}

export function saveOperationDraft(
  player: string | undefined,
  levelId: number,
  cells: readonly OperationCell[],
): void {
  try {
    window.localStorage.setItem(
      operationDraftKey(player, levelId),
      JSON.stringify(cells),
    );
  } catch {
    void 0;
  }
}

export async function executeMobileScript(source: string): Promise<unknown> {
  const AsyncFunction = Object.getPrototypeOf(async function () {})
    .constructor as new (body: string) => AsyncScript;
  // Notebook cells display a lone expression's value (including awaited
  // contract reads). Compile before running so a runtime error is never
  // retried as a statement, which could duplicate an on-chain operation.
  let expression: AsyncScript | undefined;
  try {
    expression = new AsyncFunction(`return await (${source}\n)`);
  } catch {
    // Multi-statement cells are valid scripts and keep ordinary JS semantics.
  }
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]): void => {
    logs.push(values.map((value) =>
      typeof value === "string" ? value : formatOperationResult(value),
    ).join(" "));
    originalLog(...values);
  };
  try {
    const result = expression
      ? await expression()
      : await new AsyncFunction(source)();
    return result === undefined && logs.length > 0 ? logs.join("\n") : result;
  } finally {
    console.log = originalLog;
  }
}

function operationBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  const bytes = new Uint8Array(entries.length);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (
      entry === undefined ||
      entry[0] !== String(index) ||
      typeof entry[1] !== "number" ||
      !Number.isInteger(entry[1]) ||
      entry[1] < 0 ||
      entry[1] > 255
    ) return null;
    bytes[index] = entry[1];
  }
  return bytes;
}

function decodeOperationBytes(bytes: Uint8Array): {
  hex: string;
  text: string | null;
} {
  const hex = `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const hasBinaryControls = Array.from(text).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
        (code >= 0x7f && code <= 0x9f);
    });
    return { hex, text: hasBinaryControls ? null : text };
  } catch {
    return { hex, text: null };
  }
}

function normalizeOperationResult(value: unknown): unknown {
  const bytes = operationBytes(value);
  if (bytes !== null) {
    const decoded = decodeOperationBytes(bytes);
    return {
      type: "Bytes",
      length: bytes.byteLength,
      ...(decoded.text === null ? {} : { utf8: decoded.text }),
      hex: decoded.hex,
    };
  }
  if (Array.isArray(value)) return value.map(normalizeOperationResult);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeOperationResult(item)]),
    );
  }
  return typeof value === "bigint" ? value.toString() : value;
}

function formatOperationResult(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (value === undefined) return "undefined";
  const byteValue = operationBytes(value);
  if (byteValue !== null) {
    const { hex, text } = decodeOperationBytes(byteValue);
    return text === null
      ? `Bytes · ${byteValue.byteLength} ${byteValue.byteLength === 1 ? "byte" : "bytes"}\n${hex}`
      : `UTF-8\n${text}\n\nHEX\n${hex}`;
  }
  try {
    return JSON.stringify(normalizeOperationResult(value), null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

type FieldContext = {
  district: NarrativeText;
  dispatch: NarrativeText;
  scan: NarrativeText;
};

const FIELD_CONTEXT: Readonly<Record<number, FieldContext>> = {
  0: {
    district: {
      "pt-BR": "Núcleo de Meridian",
      en: "Meridian Core",
      es: "Núcleo de Meridian",
    },
    dispatch: {
      "pt-BR":
        "O primeiro dossiê foi liberado. Observe o que a instância aceita antes de decidir em quem confiar.",
      en: "The first dossier is cleared. Observe what the instance accepts before deciding whom to trust.",
      es: "El primer expediente está habilitado. Observa qué acepta la instancia antes de decidir en quién confiar.",
    },
    scan: {
      "pt-BR":
        "Sinal de campo: acesso provisório. Nenhum dado de solução foi gravado.",
      en: "Field signal: provisional access. No solution data has been recorded.",
      es: "Señal de campo: acceso provisional. No se registraron datos de la solución.",
    },
  },
  1: {
    district: {
      "pt-BR": "Registro Central",
      en: "Central Registry",
      es: "Registro Central",
    },
    dispatch: {
      "pt-BR":
        "Há uma operação que parece comum demais para ser repetida sem consequência.",
      en: "One operation looks too ordinary to be repeatable without consequence.",
      es: "Hay una operación que parece demasiado común para repetirse sin consecuencias.",
    },
    scan: {
      "pt-BR":
        "Selo de registro encontrado. O histórico importa mais que a fachada.",
      en: "Registry seal found. History matters more than appearances.",
      es: "Se encontró el sello del registro. El historial importa más que la fachada.",
    },
  },
  2: {
    district: {
      "pt-BR": "Corredor de Serviço",
      en: "Service Corridor",
      es: "Pasillo de Servicio",
    },
    dispatch: {
      "pt-BR":
        "O pedido tem uma assinatura. A investigação é descobrir de quem ela deveria ser.",
      en: "The request has a signature. The investigation is to find whose it should be.",
      es: "La solicitud lleva una firma. La investigación consiste en descubrir a quién debería pertenecer.",
    },
    scan: {
      "pt-BR": "Rota de serviço catalogada. Sem credencial anexada.",
      en: "Service route catalogued. No credential attached.",
      es: "Ruta de servicio catalogada. Sin credencial adjunta.",
    },
  },
  3: {
    district: { "pt-BR": "Armazém 17", en: "Warehouse 17", es: "Almacén 17" },
    dispatch: {
      "pt-BR":
        "Uma contagem termina onde alguém decidiu que ela terminaria. Confira as bordas.",
      en: "A count ends where someone decided it would. Check the edges.",
      es: "Un conteo termina donde alguien decidió que terminara. Revisa los límites.",
    },
    scan: {
      "pt-BR": "Lacre do armazém preservado. Leitura somente para contexto.",
      en: "Warehouse seal preserved. Readout is context only.",
      es: "El sello del almacén permanece intacto. Lectura solo contextual.",
    },
  },
  4: {
    district: { "pt-BR": "Piso 24", en: "Floor 24", es: "Piso 24" },
    dispatch: {
      "pt-BR":
        "O caminho passa por mais de uma peça. O limite da confiança pode não estar onde parece.",
      en: "The path crosses more than one component. The trust boundary may not be where it seems.",
      es: "El recorrido pasa por más de un componente. El límite de confianza quizá no esté donde parece.",
    },
    scan: {
      "pt-BR":
        "Diagrama de passagem recuperado. Nenhuma combinação foi exposta.",
      en: "Passage diagram recovered. No combination has been exposed.",
      es: "Diagrama del recorrido recuperado. No se reveló ninguna combinación.",
    },
  },
  5: {
    district: {
      "pt-BR": "Pátio de Custódia",
      en: "Custody Yard",
      es: "Patio de Custodia",
    },
    dispatch: {
      "pt-BR":
        "Uma chamada externa pode falhar; a questão é o que fica de pé depois disso.",
      en: "An external call can fail; the question is what remains standing afterward.",
      es: "Una llamada externa puede fallar; la pregunta es qué permanece en pie después.",
    },
    scan: {
      "pt-BR": "Registro de custódia íntegro. A leitura não altera o caso.",
      en: "Custody log intact. This reading does not alter the case.",
      es: "Registro de custodia intacto. Esta lectura no modifica el caso.",
    },
  },
  6: {
    district: {
      "pt-BR": "Arquivo Voss",
      en: "Voss Archive",
      es: "Archivo de Voss",
    },
    dispatch: {
      "pt-BR":
        "Os números parecem estáveis até que deixem de ser. Procure o comportamento, não o valor isolado.",
      en: "Numbers look stable until they are not. Look for behavior, not the isolated value.",
      es: "Los números parecen estables hasta que dejan de serlo. Busca el comportamiento, no un valor aislado.",
    },
    scan: {
      "pt-BR":
        "Terminal de arquivo em modo de observação. Sem unidade ou valor revelado.",
      en: "Archive terminal in observation mode. No unit or value revealed.",
      es: "Terminal de archivo en modo de observación. No se revela ninguna unidad ni valor.",
    },
  },
  7: {
    district: {
      "pt-BR": "Rede de Energia",
      en: "Energy Grid",
      es: "Red de Energía",
    },
    dispatch: {
      "pt-BR":
        "A prova pode estar no que foi preservado, não no volume do que circula.",
      en: "Proof may lie in what was preserved, not in the volume that moves.",
      es: "La prueba puede estar en lo que se conservó, no en el volumen de lo que circula.",
    },
    scan: {
      "pt-BR": "Telemetria parcial salva como contexto de campo.",
      en: "Partial telemetry saved as field context.",
      es: "Telemetría parcial guardada como contexto de campo.",
    },
  },
  8: {
    district: { "pt-BR": "Setor 13", en: "Sector 13", es: "Sector 13" },
    dispatch: {
      "pt-BR":
        "Quando um resultado parece inevitável, vale perguntar quem consegue antecipá-lo.",
      en: "When an outcome looks inevitable, ask who can anticipate it.",
      es: "Cuando un resultado parece inevitable, conviene preguntar quién puede anticiparlo.",
    },
    scan: {
      "pt-BR": "Visada do Setor 13 registrada. Sem previsão operacional.",
      en: "Sector 13 sightline recorded. No operational forecast.",
      es: "Se registró la línea de visión del Sector 13. Sin pronóstico operativo.",
    },
  },
  9: {
    district: {
      "pt-BR": "Observatório",
      en: "Observatory",
      es: "Observatorio",
    },
    dispatch: {
      "pt-BR":
        "A identidade da resposta pode ser tão importante quanto a resposta em si.",
      en: "The identity of an answer can matter as much as the answer itself.",
      es: "La identidad de una respuesta puede importar tanto como la respuesta misma.",
    },
    scan: {
      "pt-BR": "Lente do observatório alinhada. Sem resultado de consulta.",
      en: "Observatory lens aligned. No query result included.",
      es: "Lente del observatorio alineada. Sin resultados de consulta.",
    },
  },
  10: {
    district: {
      "pt-BR": "Arquivo de Reescrita",
      en: "Rewrite Archive",
      es: "Archivo de Reescritura",
    },
    dispatch: {
      "pt-BR":
        "Antes de comparar dados, descubra se duas formas realmente significam a mesma coisa.",
      en: "Before comparing data, find out whether two forms truly mean the same thing.",
      es: "Antes de comparar datos, averigua si dos formas realmente significan lo mismo.",
    },
    scan: {
      "pt-BR": "Folha de reescrita marcada como evidência ambiental.",
      en: "Rewrite sheet marked as environmental evidence.",
      es: "Documento de reescritura marcado como evidencia de contexto.",
    },
  },
  11: {
    district: {
      "pt-BR": "Ateliê do Arquiteto",
      en: "Architect's Atelier",
      es: "Taller del Arquitecto",
    },
    dispatch: {
      "pt-BR":
        "O estado pode parecer completo e ainda assim esconder uma transição incompleta.",
      en: "State may look complete while still hiding an incomplete transition.",
      es: "El estado puede parecer completo y aun así ocultar una transición incompleta.",
    },
    scan: {
      "pt-BR":
        "Modelo de arquitetura visível; nenhuma sequência foi divulgada.",
      en: "Architecture model visible; no sequence has been disclosed.",
      es: "Modelo arquitectónico visible; no se reveló ninguna secuencia.",
    },
  },
  12: {
    district: {
      "pt-BR": "Câmara Final",
      en: "Final Chamber",
      es: "Cámara Final",
    },
    dispatch: {
      "pt-BR":
        "O dossiê final pede uma leitura conjunta da temporada, sem oferecer um atalho.",
      en: "The final dossier calls for a season-wide reading without offering a shortcut.",
      es: "El expediente final requiere leer la temporada en conjunto, sin ofrecer atajos.",
    },
    scan: {
      "pt-BR":
        "Câmara final catalogada. O conteúdo permanece sob investigação.",
      en: "Final chamber catalogued. Its contents remain under investigation.",
      es: "Cámara final catalogada. El contenido sigue bajo investigación.",
    },
  },
};

type DeviceIconId = OsAppId | "copy" | "switch" | "disconnect";

const ICONS: Record<DeviceIconId, ReactElement> = {
  investigation: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2M5 5l2 2M19 5l-2 2M5 19l2-2M19 19l-2-2" />
    </>
  ),
  news: (
    <>
      <path d="M5 4h14v16H5zM8 8h8M8 11h3v4H8zM14 11h2M14 14h2M8 18h8M3 8v10a2 2 0 002 2" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7V5h14v4M4 7h14a2 2 0 012 2v11H4z" />
      <path d="M20 12h-6v5h6M16 14.5h.01" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h3" />
    </>
  ),
  switch: (
    <>
      <path d="M4 7h15l-4-4M20 17H5l4 4M19 7l-4 4M5 17l4-4" />
    </>
  ),
  disconnect: (
    <>
      <path d="M12 3v9M7 5a9 9 0 1010 0" />
    </>
  ),
  collection: (
    <>
      <rect x="4" y="4" width="6" height="7" rx="1" />
      <rect x="14" y="4" width="6" height="7" rx="1" />
      <rect x="4" y="14" width="6" height="7" rx="1" />
      <rect x="14" y="14" width="6" height="7" rx="1" />
    </>
  ),
  cases: (
    <>
      <path d="M4 6h6l2 2h8v11H4z" />
      <path d="M4 10h16" />
    </>
  ),
  comms: (
    <>
      <path d="M4 5h16v10H9l-5 4z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  evidence: (
    <>
      <circle cx="10" cy="10" r="5" />
      <path d="M14 14l5 5" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M7 9l3 3-3 3M13 15h4" />
    </>
  ),
  story: (
    <>
      <path d="M5 4h9a3 3 0 013 3v13H8a3 3 0 00-3 3z" />
      <path d="M5 4v19" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 3.5" />
      <path d="M12 17h.01" />
    </>
  ),
  operations: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="M7 9l3 3-3 3M12 15h5" />
      <path d="M7 3v2M17 3v2M7 19v2M17 19v2" />
    </>
  ),
};

function DeviceIcon({ id }: { id: DeviceIconId }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[id]}
    </svg>
  );
}

const OS_SYMBOLS = {
  home: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMTcuOSwxMTAuMWwtODAtODBhMTQsMTQsMCwwLDAtMTkuOCwwbC04MCw4MEExMy45MiwxMy45MiwwLDAsMCwzNCwxMjB2OTZhNiw2LDAsMCwwLDYsNmg2NGE2LDYsMCwwLDAsNi02VjE1OGgzNnY1OGE2LDYsMCwwLDAsNiw2aDY0YTYsNiwwLDAsMCw2LTZWMTIwQTEzLjkyLDEzLjkyLDAsMCwwLDIxNy45LDExMC4xWk0yMTAsMjEwSDE1OFYxNTJhNiw2LDAsMCwwLTYtNkgxMDRhNiw2LDAsMCwwLTYsNnY1OEg0NlYxMjBhMiwyLDAsMCwxLC41OC0xLjQybDgwLTgwYTIsMiwwLDAsMSwyLjg0LDBsODAsODBBMiwyLDAsMCwxLDIxMCwxMjBaIi8+PC9zdmc+",
  apps: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0xMDQsNDJINTZBMTQsMTQsMCwwLDAsNDIsNTZ2NDhhMTQsMTQsMCwwLDAsMTQsMTRoNDhhMTQsMTQsMCwwLDAsMTQtMTRWNTZBMTQsMTQsMCwwLDAsMTA0LDQyWm0yLDYyYTIsMiwwLDAsMS0yLDJINTZhMiwyLDAsMCwxLTItMlY1NmEyLDIsMCwwLDEsMi0yaDQ4YTIsMiwwLDAsMSwyLDJabTk0LTYySDE1MmExNCwxNCwwLDAsMC0xNCwxNHY0OGExNCwxNCwwLDAsMCwxNCwxNGg0OGExNCwxNCwwLDAsMCwxNC0xNFY1NkExNCwxNCwwLDAsMCwyMDAsNDJabTIsNjJhMiwyLDAsMCwxLTIsMkgxNTJhMiwyLDAsMCwxLTItMlY1NmEyLDIsMCwwLDEsMi0yaDQ4YTIsMiwwLDAsMSwyLDJabS05OCwzNEg1NmExNCwxNCwwLDAsMC0xNCwxNHY0OGExNCwxNCwwLDAsMCwxNCwxNGg0OGExNCwxNCwwLDAsMCwxNC0xNFYxNTJBMTQsMTQsMCwwLDAsMTA0LDEzOFptMiw2MmEyLDIsMCwwLDEtMiwySDU2YTIsMiwwLDAsMS0yLTJWMTUyYTIsMiwwLDAsMSwyLTJoNDhhMiwyLDAsMCwxLDIsMlptOTQtNjJIMTUyYTE0LDE0LDAsMCwwLTE0LDE0djQ4YTE0LDE0LDAsMCwwLDE0LDE0aDQ4YTE0LDE0LDAsMCwwLDE0LTE0VjE1MkExNCwxNCwwLDAsMCwyMDAsMTM4Wm0yLDYyYTIsMiwwLDAsMS0yLDJIMTUyYTIsMiwwLDAsMS0yLTJWMTUyYTIsMiwwLDAsMSwyLTJoNDhhMiwyLDAsMCwxLDIsMloiLz48L3N2Zz4=",
  notifications:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMjAuMDcsMTc2Ljk0QzIxNC40MSwxNjcuMiwyMDYsMTM5LjczLDIwNiwxMDRhNzgsNzgsMCwxLDAtMTU2LDBjMCwzNS43NC04LjQyLDYzLjItMTQuMDgsNzIuOTRBMTQsMTQsMCwwLDAsNDgsMTk4SDkwLjQ4YTM4LDM4LDAsMCwwLDc1LDBIMjA4YTE0LDE0LDAsMCwwLDEyLjA2LTIxLjA2Wk0xMjgsMjE4YTI2LDI2LDAsMCwxLTI1LjI5LTIwaDUwLjU4QTI2LDI2LDAsMCwxLDEyOCwyMThabTgxLjcxLTMzYTEuOSwxLjksMCwwLDEtMS43LDFINDhhMS45LDEuOSwwLDAsMS0xLjctMSwyLDIsMCwwLDEsMC0yQzUzLjg3LDE3MCw2MiwxMzkuNjksNjIsMTA0YTY2LDY2LDAsMSwxLDEzMiwwYzAsMzUuNjgsOC4xNCw2NS45NSwxNS43MSw3OUEyLDIsMCwwLDEsMjA5LjcxLDE4NVoiLz48L3N2Zz4=",
  controls:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik00MCw4Nkg3NC42YTMwLDMwLDAsMCwwLDU4LjgsMEgyMTZhNiw2LDAsMCwwLDAtMTJIMTMzLjRhMzAsMzAsMCwwLDAtNTguOCwwSDQwYTYsNiwwLDAsMCwwLDEyWm02NC0yNEExOCwxOCwwLDEsMSw4Niw4MCwxOCwxOCwwLDAsMSwxMDQsNjJaTTIxNiwxNzBIMTk3LjRhMzAsMzAsMCwwLDAtNTguOCwwSDQwYTYsNiwwLDAsMCwwLDEyaDk4LjZhMzAsMzAsMCwwLDAsNTguOCwwSDIxNmE2LDYsMCwwLDAsMC0xMlptLTQ4LDI0YTE4LDE4LDAsMSwxLDE4LTE4QTE4LDE4LDAsMCwxLDE2OCwxOTRaIi8+PC9zdmc+",
  operator:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0xMjgsMjZBMTAyLDEwMiwwLDEsMCwyMzAsMTI4LDEwMi4xMiwxMDIuMTIsMCwwLDAsMTI4LDI2Wk03MS40NCwxOThhNjYsNjYsMCwwLDEsMTEzLjEyLDAsODkuOCw4OS44LDAsMCwxLTExMy4xMiwwWk05NCwxMjBhMzQsMzQsMCwxLDEsMzQsMzRBMzQsMzQsMCwwLDEsOTQsMTIwWm05OS41MSw2OS42NGE3Ny41Myw3Ny41MywwLDAsMC00MC0zMS4zOCw0Niw0NiwwLDEsMC01MSwwLDc3LjUzLDc3LjUzLDAsMCwwLTQwLDMxLjM4LDkwLDkwLDAsMSwxLDEzMSwwWiIvPjwvc3ZnPg==",
  switcher:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMjkuMTgsMTczYTYsNiwwLDAsMS0yLjE2LDguMmwtOTYsNTZhNiw2LDAsMCwxLTYsMGwtOTYtNTZhNiw2LDAsMCwxLDYtMTAuMzZsOTMsNTQuMjMsOTMtNTQuMjNBNiw2LDAsMCwxLDIyOS4xOCwxNzNaTTIyMSwxMjIuODJsLTkzLDU0LjIzTDM1LDEyMi44MmE2LDYsMCwwLDAtNiwxMC4zNmw5Niw1NmE2LDYsMCwwLDAsNiwwbDk2LTU2YTYsNiwwLDAsMC02LTEwLjM2Wk0yNiw4MGE2LDYsMCwwLDEsMy01LjE4bDk2LTU2YTYsNiwwLDAsMSw2LDBsOTYsNTZhNiw2LDAsMCwxLDAsMTAuMzZsLTk2LDU2YTYsNiwwLDAsMS02LDBsLTk2LTU2QTYsNiwwLDAsMSwyNiw4MFptMTcuOTEsMEwxMjgsMTI5LjA1LDIxMi4wOSw4MCwxMjgsMzFaIi8+PC9zdmc+",
  search:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMjguMjQsMjE5Ljc2bC01MS4zOC01MS4zOGE4Ni4xNSw4Ni4xNSwwLDEsMC04LjQ4LDguNDhsNTEuMzgsNTEuMzhhNiw2LDAsMCwwLDguNDgtOC40OFpNMzgsMTEyYTc0LDc0LDAsMSwxLDc0LDc0QTc0LjA5LDc0LjA5LDAsMCwxLDM4LDExMloiLz48L3N2Zz4=",
  quick:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMTMuODQsMTE4LjYzYTYsNiwwLDAsMC0zLjczLTQuMjVMMTUwLjg4LDkyLjE3bDE1LTc1YTYsNiwwLDAsMC0xMC4yNy01LjI3bC0xMTIsMTIwYTYsNiwwLDAsMCwyLjI4LDkuNzFsNTkuMjMsMjIuMjEtMTUsNzVhNiw2LDAsMCwwLDMuMTQsNi41MkE2LjA3LDYuMDcsMCwwLDAsOTYsMjQ2YTYsNiwwLDAsMCw0LjM5LTEuOTFsMTEyLTEyMEE2LDYsMCwwLDAsMjEzLjg0LDExOC42M1pNMTA2LDIyMC40NmwxMS44NS01OS4yOGE2LDYsMCwwLDAtMy43Ny02LjhsLTU1LjYtMjAuODUsOTEuNDYtOThMMTM4LjEyLDk0LjgyYTYsNiwwLDAsMCwzLjc3LDYuOGw1NS42LDIwLjg1WiIvPjwvc3ZnPg==",
  settings:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0xMjgsODJhNDYsNDYsMCwxLDAsNDYsNDZBNDYuMDYsNDYuMDYsMCwwLDAsMTI4LDgyWm0wLDgwYTM0LDM0LDAsMSwxLDM0LTM0QTM0LDM0LDAsMCwxLDEyOCwxNjJabTEwOC01NC40YTYsNiwwLDAsMC0yLjkyLTRMMjAyLjY0LDg2LjIybC0uNDItLjcxTDIwMi4xLDUxLjJBNiw2LDAsMCwwLDIwMCw0Ni42NGExMTAuMTIsMTEwLjEyLDAsMCwwLTM2LjA3LTIwLjMxLDYsNiwwLDAsMC00Ljg0LjQ1TDEyOC40Niw0My44NmgtMUw5Ni45MSwyNi43NmE2LDYsMCwwLDAtNC44Ni0uNDRBMTA5LjkyLDEwOS45MiwwLDAsMCw1Niw0Ni42OGE2LDYsMCwwLDAtMi4xMiw0LjU1bC0uMTYsMzQuMzRjLS4xNC4yMy0uMjguNDctLjQxLjcxTDIyLjkxLDEwMy41N0E2LDYsMCwwLDAsMjAsMTA3LjYyYTEwNC44MSwxMDQuODEsMCwwLDAsMCw0MC43OCw2LDYsMCwwLDAsMi45Miw0bDMwLjQyLDE3LjMzLjQyLjcxLjEyLDM0LjMxQTYsNiwwLDAsMCw1NiwyMDkuMzZhMTEwLjEyLDExMC4xMiwwLDAsMCwzNi4wNywyMC4zMSw2LDYsMCwwLDAsNC44NC0uNDVsMzAuNjEtMTcuMDhoMWwzMC41NiwxNy4xQTYuMDksNi4wOSwwLDAsMCwxNjIsMjMwYTUuODMsNS44MywwLDAsMCwxLjkzLS4zMiwxMDkuOTIsMTA5LjkyLDAsMCwwLDM2LTIwLjM2LDYsNiwwLDAsMCwyLjEyLTQuNTVsLjE2LTM0LjM0Yy4xNC0uMjMuMjgtLjQ3LjQxLS43MWwzMC40Mi0xNy4yOWE2LDYsMCwwLDAsMi45Mi00LjA1QTEwNC44MSwxMDQuODEsMCwwLDAsMjM2LDEwNy42Wm0tMTEuMjUsMzUuNzlMMTk1LjMyLDE2MC4xYTYuMDcsNi4wNywwLDAsMC0yLjI4LDIuM2MtLjU5LDEtMS4yMSwyLjExLTEuODYsMy4xNGE2LDYsMCwwLDAtLjkxLDMuMTZsLS4xNiwzMy4yMWE5OC4xNSw5OC4xNSwwLDAsMS0yNy41MiwxNS41M0wxMzMsMjAwLjg4YTYsNiwwLDAsMC0yLjkzLS43N2gtLjE0Yy0xLjI0LDAtMi41LDAtMy43NCwwYTYsNiwwLDAsMC0zLjA3Ljc2TDkzLjQ1LDIxNy40M2E5OCw5OCwwLDAsMS0yNy41Ni0xNS40OWwtLjEyLTMzLjE3YTYsNiwwLDAsMC0uOTEtMy4xNmMtLjY0LTEtMS4yNy0yLjA4LTEuODYtMy4xNGE2LDYsMCwwLDAtMi4yNy0yLjNMMzEuMywxNDMuNGE5Myw5MywwLDAsMSwwLTMwLjc5TDYwLjY4LDk1LjlBNi4wNyw2LjA3LDAsMCwwLDYzLDkzLjZjLjU5LTEsMS4yMS0yLjExLDEuODYtMy4xNGE2LDYsMCwwLDAsLjkxLTMuMTZsLjE2LTMzLjIxQTk4LjE1LDk4LjE1LDAsMCwxLDkzLjQxLDM4LjU2TDEyMyw1NS4xMmE1LjgxLDUuODEsMCwwLDAsMy4wNy43NmMxLjI0LDAsMi41LDAsMy43NCwwYTYsNiwwLDAsMCwzLjA3LS43NmwyOS42NS0xNi41NmE5OCw5OCwwLDAsMSwyNy41NiwxNS40OWwuMTIsMzMuMTdhNiw2LDAsMCwwLC45MSwzLjE2Yy42NCwxLDEuMjcsMi4wOCwxLjg2LDMuMTRhNiw2LDAsMCwwLDIuMjcsMi4zTDIyNC43LDExMi42QTkzLDkzLDAsMCwxLDIyNC43MywxNDMuMzlaIi8+PC9zdmc+",
  notes:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMjguMjQsNTkuNzZsLTMyLTMyYTYsNiwwLDAsMC04LjQ4LDBsLTk2LDk2QTYsNiwwLDAsMCw5MCwxMjh2MzJhNiw2LDAsMCwwLDYsNmgzMmE2LDYsMCwwLDAsNC4yNC0xLjc2bDk2LTk2QTYsNiwwLDAsMCwyMjguMjQsNTkuNzZaTTEyNS41MSwxNTRIMTAyVjEzMC40OWw2Ni02NkwxOTEuNTEsODhaTTIwMCw3OS41MSwxNzYuNDksNTYsMTkyLDQwLjQ5LDIxNS41MSw2NFpNMjIyLDEyOHY4MGExNCwxNCwwLDAsMS0xNCwxNEg0OGExNCwxNCwwLDAsMS0xNC0xNFY0OEExNCwxNCwwLDAsMSw0OCwzNGg4MGE2LDYsMCwwLDEsMCwxMkg0OGEyLDIsMCwwLDAtMiwyVjIwOGEyLDIsMCwwLDAsMiwySDIwOGEyLDIsMCwwLDAsMi0yVjEyOGE2LDYsMCwwLDEsMTIsMFoiLz48L3N2Zz4=",
  files:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMTYsNzRIMTMwLjQ5bC0yNy45LTI3LjlhMTMuOTQsMTMuOTQsMCwwLDAtOS45LTQuMUg0MEExNCwxNCwwLDAsMCwyNiw1NlYyMDAuNjJBMTMuMzksMTMuMzksMCwwLDAsMzkuMzgsMjE0SDIxNi44OUExMy4xMiwxMy4xMiwwLDAsMCwyMzAsMjAwLjg5Vjg4QTE0LDE0LDAsMCwwLDIxNiw3NFpNNDAsNTRIOTIuNjlhMiwyLDAsMCwxLDEuNDEuNTlMMTEzLjUxLDc0SDM4VjU2QTIsMiwwLDAsMSw0MCw1NFpNMjE4LDIwMC44OWExLjExLDEuMTEsMCwwLDEtMS4xMSwxLjExSDM5LjM4QTEuNCwxLjQsMCwwLDEsMzgsMjAwLjYyVjg2SDIxNmEyLDIsMCwwLDEsMiwyWiIvPjwvc3ZnPg==",
  browser:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0xMjgsMjZBMTAyLDEwMiwwLDEsMCwyMzAsMTI4LDEwMi4xMiwxMDIuMTIsMCwwLDAsMTI4LDI2Wm04MS41Nyw2NEgxNjkuMTlhMTMyLjU4LDEzMi41OCwwLDAsMC0yNS43My01MC42N0E5MC4yOSw5MC4yOSwwLDAsMSwyMDkuNTcsOTBaTTIxOCwxMjhhODkuNyw4OS43LDAsMCwxLTMuODMsMjZIMTcxLjgxYTE1NS40MywxNTUuNDMsMCwwLDAsMC01Mmg0Mi4zNkE4OS43LDg5LjcsMCwwLDEsMjE4LDEyOFptLTkwLDg3LjgzYTExMCwxMTAsMCwwLDEtMTUuMTktMTkuNDVBMTI0LjI0LDEyNC4yNCwwLDAsMSw5OS4zNSwxNjZoNTcuM2ExMjQuMjQsMTI0LjI0LDAsMCwxLTEzLjQ2LDMwLjM4QTExMCwxMTAsMCwwLDEsMTI4LDIxNS44M1pNOTYuNDUsMTU0YTEzOS4xOCwxMzkuMTgsMCwwLDEsMC01Mmg2My4xYTEzOS4xOCwxMzkuMTgsMCwwLDEsMCw1MlpNMzgsMTI4YTg5LjcsODkuNywwLDAsMSwzLjgzLTI2SDg0LjE5YTE1NS40MywxNTUuNDMsMCwwLDAsMCw1Mkg0MS44M0E4OS43LDg5LjcsMCwwLDEsMzgsMTI4Wm05MC04Ny44M2ExMTAsMTEwLDAsMCwxLDE1LjE5LDE5LjQ1QTEyNC4yNCwxMjQuMjQsMCwwLDEsMTU2LjY1LDkwSDk5LjM1YTEyNC4yNCwxMjQuMjQsMCwwLDEsMTMuNDYtMzAuMzhBMTEwLDExMCwwLDAsMSwxMjgsNDAuMTdabS0xNS40Ni0uODRBMTMyLjU4LDEzMi41OCwwLDAsMCw4Ni44MSw5MEg0Ni40M0E5MC4yOSw5MC4yOSwwLDAsMSwxMTIuNTQsMzkuMzNaTTQ2LjQzLDE2Nkg4Ni44MWExMzIuNTgsMTMyLjU4LDAsMCwwLDI1LjczLDUwLjY3QTkwLjI5LDkwLjI5LDAsMCwxLDQ2LjQzLDE2NlptOTcsNTAuNjdBMTMyLjU4LDEzMi41OCwwLDAsMCwxNjkuMTksMTY2aDQwLjM4QTkwLjI5LDkwLjI5LDAsMCwxLDE0My40NiwyMTYuNjdaIi8+PC9zdmc+",
  wifi: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0xMzgsMjA0YTEwLDEwLDAsMSwxLTEwLTEwQTEwLDEwLDAsMCwxLDEzOCwyMDRaTTIzNS44MSw4OC41NWExNzAsMTcwLDAsMCwwLTIxNS42MiwwLDYsNiwwLDEsMCw3LjYyLDkuMjcsMTU4LDE1OCwwLDAsMSwyMDAuMzgsMCw2LDYsMCwxLDAsNy42Mi05LjI3Wm0tMzIuMDgsMzUuNzlhMTIyLDEyMiwwLDAsMC0xNTEuNDYsMCw2LDYsMCwwLDAsNy40Niw5LjQxLDExMCwxMTAsMCwwLDEsMTM2LjU0LDBBNiw2LDAsMCwwLDIwMCwxMzVhNiw2LDAsMCwwLDMuNzMtMTAuN1ptLTMyLjIsMzUuODFhNzQsNzQsMCwwLDAtODcuMDYsMCw2LDYsMCwwLDAsNy4wNiw5LjcsNjIsNjIsMCwwLDEsNzIuOTQsMCw2LDYsMCwwLDAsOC4zOC0xLjMyQTYsNiwwLDAsMCwxNzEuNTMsMTYwLjE1WiIvPjwvc3ZnPg==",
  bluetooth:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0xOTUuNiwxNzEuMiwxMzgsMTI4bDU3LjYtNDMuMmE2LDYsMCwwLDAsMC05LjZsLTY0LTQ4QTYsNiwwLDAsMCwxMjIsMzJ2ODRMNjcuNiw3NS4yYTYsNiwwLDAsMC03LjIsOS42TDExOCwxMjgsNjAuNCwxNzEuMmE2LDYsMCwxLDAsNy4yLDkuNkwxMjIsMTQwdjg0YTYsNiwwLDAsMCw5LjYsNC44bDY0LTQ4YTYsNiwwLDAsMCwwLTkuNlpNMTM0LDQ0bDQ4LDM2LTQ4LDM2Wm0wLDE2OFYxNDBsNDgsMzZaIi8+PC9zdmc+",
  focus:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMzIuMTMsMTQzLjY0YTYsNiwwLDAsMC02LTEuNDlBOTAuMDcsOTAuMDcsMCwwLDEsMTEzLjg2LDI5Ljg1YTYsNiwwLDAsMC03LjQ5LTcuNDhBMTAyLjg4LDEwMi44OCwwLDAsMCw1NC40OCw1OC42OCwxMDIsMTAyLDAsMCwwLDE5Ny4zMiwyMDEuNTJhMTAyLjg4LDEwMi44OCwwLDAsMCwzNi4zMS01MS44OUE2LDYsMCwwLDAsMjMyLjEzLDE0My42NFptLTQyLDQ4LjI5YTkwLDkwLDAsMCwxLTEyNi0xMjZBOTAuOSw5MC45LDAsMCwxLDk5LjY1LDM3LjY2LDEwMi4wNiwxMDIuMDYsMCwwLDAsMjE4LjM0LDE1Ni4zNSw5MC45LDkwLjksMCwwLDEsMTkwLjEsMTkxLjkzWiIvPjwvc3ZnPg==",
  brightness:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0xMjIsNDBWMTZhNiw2LDAsMCwxLDEyLDBWNDBhNiw2LDAsMCwxLTEyLDBabTY4LDg4YTYyLDYyLDAsMSwxLTYyLTYyQTYyLjA3LDYyLjA3LDAsMCwxLDE5MCwxMjhabS0xMiwwYTUwLDUwLDAsMSwwLTUwLDUwQTUwLjA2LDUwLjA2LDAsMCwwLDE3OCwxMjhaTTU5Ljc2LDY4LjI0YTYsNiwwLDEsMCw4LjQ4LTguNDhsLTE2LTE2YTYsNiwwLDAsMC04LjQ4LDguNDhabTAsMTE5LjUyLTE2LDE2YTYsNiwwLDEsMCw4LjQ4LDguNDhsMTYtMTZhNiw2LDAsMSwwLTguNDgtOC40OFpNMTkyLDcwYTYsNiwwLDAsMCw0LjI0LTEuNzZsMTYtMTZhNiw2LDAsMCwwLTguNDgtOC40OGwtMTYsMTZBNiw2LDAsMCwwLDE5Miw3MFptNC4yNCwxMTcuNzZhNiw2LDAsMCwwLTguNDgsOC40OGwxNiwxNmE2LDYsMCwwLDAsOC40OC04LjQ4Wk00NiwxMjhhNiw2LDAsMCwwLTYtNkgxNmE2LDYsMCwwLDAsMCwxMkg0MEE2LDYsMCwwLDAsNDYsMTI4Wm04Miw4MmE2LDYsMCwwLDAtNiw2djI0YTYsNiwwLDAsMCwxMiwwVjIxNkE2LDYsMCwwLDAsMTI4LDIxMFptMTEyLTg4SDIxNmE2LDYsMCwwLDAsMCwxMmgyNGE2LDYsMCwwLDAsMC0xMloiLz48L3N2Zz4=",
  qr: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0xMDQsNDJINTZBMTQsMTQsMCwwLDAsNDIsNTZ2NDhhMTQsMTQsMCwwLDAsMTQsMTRoNDhhMTQsMTQsMCwwLDAsMTQtMTRWNTZBMTQsMTQsMCwwLDAsMTA0LDQyWm0yLDYyYTIsMiwwLDAsMS0yLDJINTZhMiwyLDAsMCwxLTItMlY1NmEyLDIsMCwwLDEsMi0yaDQ4YTIsMiwwLDAsMSwyLDJabS0yLDM0SDU2YTE0LDE0LDAsMCwwLTE0LDE0djQ4YTE0LDE0LDAsMCwwLDE0LDE0aDQ4YTE0LDE0LDAsMCwwLDE0LTE0VjE1MkExNCwxNCwwLDAsMCwxMDQsMTM4Wm0yLDYyYTIsMiwwLDAsMS0yLDJINTZhMiwyLDAsMCwxLTItMlYxNTJhMiwyLDAsMCwxLDItMmg0OGEyLDIsMCwwLDEsMiwyWk0yMDAsNDJIMTUyYTE0LDE0LDAsMCwwLTE0LDE0djQ4YTE0LDE0LDAsMCwwLDE0LDE0aDQ4YTE0LDE0LDAsMCwwLDE0LTE0VjU2QTE0LDE0LDAsMCwwLDIwMCw0MlptMiw2MmEyLDIsMCwwLDEtMiwySDE1MmEyLDIsMCwwLDEtMi0yVjU2YTIsMiwwLDAsMSwyLTJoNDhhMiwyLDAsMCwxLDIsMlptLTY0LDcyVjE0NGE2LDYsMCwwLDEsMTIsMHYzMmE2LDYsMCwwLDEtMTIsMFptNzYtMTZhNiw2LDAsMCwxLTYsNkgxODJ2NDJhNiw2LDAsMCwxLTYsNkgxNDRhNiw2LDAsMCwxLDAtMTJoMjZWMTQ0YTYsNiwwLDAsMSwxMiwwdjEwaDI2QTYsNiwwLDAsMSwyMTQsMTYwWm0wLDMydjE2YTYsNiwwLDAsMS0xMiwwVjE5MmE2LDYsMCwwLDEsMTIsMFoiLz48L3N2Zz4=",
  camera:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMDgsNThIMTc5LjIxTDE2NSwzNi42N0E2LDYsMCwwLDAsMTYwLDM0SDk2YTYsNiwwLDAsMC01LDIuNjdMNzYuNzgsNThINDhBMjIsMjIsMCwwLDAsMjYsODBWMTkyYTIyLDIyLDAsMCwwLDIyLDIySDIwOGEyMiwyMiwwLDAsMCwyMi0yMlY4MEEyMiwyMiwwLDAsMCwyMDgsNThabTEwLDEzNGExMCwxMCwwLDAsMS0xMCwxMEg0OGExMCwxMCwwLDAsMS0xMC0xMFY4MEExMCwxMCwwLDAsMSw0OCw3MEg4MGE2LDYsMCwwLDAsNS0yLjY3TDk5LjIxLDQ2aDU3LjU3TDE3MSw2Ny4zM0E2LDYsMCwwLDAsMTc2LDcwaDMyYTEwLDEwLDAsMCwxLDEwLDEwWk0xMjgsOTBhNDIsNDIsMCwxLDAsNDIsNDJBNDIsNDIsMCwwLDAsMTI4LDkwWm0wLDcyYTMwLDMwLDAsMSwxLDMwLTMwQTMwLDMwLDAsMCwxLDEyOCwxNjJaIi8+PC9zdmc+",
  flashlight:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0xODQsMThINzJBMTQsMTQsMCwwLDAsNTgsMzJWNzcuMzNhMTQsMTQsMCwwLDAsMi44LDguNGwyMC44LDI3LjczYTIsMiwwLDAsMSwuNCwxLjIxVjIyNGExNCwxNCwwLDAsMCwxNCwxNGg2NGExNCwxNCwwLDAsMCwxNC0xNFYxMTQuNjdhMiwyLDAsMCwxLC40LTEuMmwyMC44LTI3Ljc0YTE0LDE0LDAsMCwwLDIuOC04LjRWMzJBMTQsMTQsMCwwLDAsMTg0LDE4Wk03MiwzMEgxODRhMiwyLDAsMCwxLDIsMlY1OEg3MFYzMkEyLDIsMCwwLDEsNzIsMzBaTTE4NS42LDc4LjUzbC0yMC44LDI3Ljc0YTE0LDE0LDAsMCwwLTIuOCw4LjRWMjI0YTIsMiwwLDAsMS0yLDJIOTZhMiwyLDAsMCwxLTItMlYxMTQuNjdhMTQsMTQsMCwwLDAtMi44LTguNEw3MC40LDc4LjU0YTIsMiwwLDAsMS0uNC0xLjIxVjcwSDE4NnY3LjMzQTIsMiwwLDAsMSwxODUuNiw3OC41M1pNMTM0LDEyMHYzMmE2LDYsMCwwLDEtMTIsMFYxMjBhNiw2LDAsMCwxLDEyLDBaIi8+PC9zdmc+",
  lock: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMDgsODJIMTc0VjU2YTQ2LDQ2LDAsMCwwLTkyLDBWODJINDhBMTQsMTQsMCwwLDAsMzQsOTZWMjA4YTE0LDE0LDAsMCwwLDE0LDE0SDIwOGExNCwxNCwwLDAsMCwxNC0xNFY5NkExNCwxNCwwLDAsMCwyMDgsODJaTTk0LDU2YTM0LDM0LDAsMCwxLDY4LDBWODJIOTRaTTIxMCwyMDhhMiwyLDAsMCwxLTIsMkg0OGEyLDIsMCwwLDEtMi0yVjk2YTIsMiwwLDAsMSwyLTJIMjA4YTIsMiwwLDAsMSwyLDJaIi8+PC9zdmc+",
  close:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMDQuMjQsMTk1Ljc2YTYsNiwwLDEsMS04LjQ4LDguNDhMMTI4LDEzNi40OSw2MC4yNCwyMDQuMjRhNiw2LDAsMCwxLTguNDgtOC40OEwxMTkuNTEsMTI4LDUxLjc2LDYwLjI0YTYsNiwwLDAsMSw4LjQ4LTguNDhMMTI4LDExOS41MWw2Ny43Ni02Ny43NWE2LDYsMCwwLDEsOC40OCw4LjQ4TDEzNi40OSwxMjhaIi8+PC9zdmc+",
  back: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0xNjQuMjQsMjAzLjc2YTYsNiwwLDEsMS04LjQ4LDguNDhsLTgwLTgwYTYsNiwwLDAsMSwwLTguNDhsODAtODBhNiw2LDAsMCwxLDguNDgsOC40OEw4OC40OSwxMjhaIi8+PC9zdmc+",
  next: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0xODAuMjQsMTMyLjI0bC04MCw4MGE2LDYsMCwwLDEtOC40OC04LjQ4TDE2Ny41MSwxMjgsOTEuNzYsNTIuMjRhNiw2LDAsMCwxLDguNDgtOC40OGw4MCw4MEE2LDYsMCwwLDEsMTgwLjI0LDEzMi4yNFoiLz48L3N2Zz4=",
  check:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMjguMjQsNzYuMjRsLTEyOCwxMjhhNiw2LDAsMCwxLTguNDgsMGwtNTYtNTZhNiw2LDAsMCwxLDguNDgtOC40OEw5NiwxOTEuNTEsMjE5Ljc2LDY3Ljc2YTYsNiwwLDAsMSw4LjQ4LDguNDhaIi8+PC9zdmc+",
  fingerprint:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik03MCwxMjhhMTMyLjY4LDEzMi42OCwwLDAsMS0xNCw1OS41OCw2LDYsMCwwLDEtNS4zOCwzLjMzLDYsNiwwLDAsMS01LjM2LTguNjdBMTIwLjc0LDEyMC43NCwwLDAsMCw1OCwxMjgsNjkuNzIsNjkuNzIsMCwwLDEsODQuMjUsNzMuMzZhNiw2LDAsMCwxLDcuNTEsOS4zN0E1Ny43Myw1Ny43MywwLDAsMCw3MCwxMjhabTU4LTZhNiw2LDAsMCwwLTYsNiwxODYuMDcsMTg2LjA3LDAsMCwxLTIzLjIzLDkwLjA3LDYsNiwwLDAsMCwxMC41LDUuODJBMTk4LjE0LDE5OC4xNCwwLDAsMCwxMzQsMTI4LDYsNiwwLDAsMCwxMjgsMTIyWm0wLTMyYTM4LDM4LDAsMCwwLTM4LDM4LDYsNiwwLDAsMCwxMiwwLDI2LDI2LDAsMCwxLDUyLDAsMjE2LjA2LDIxNi4wNiwwLDAsMS0yMC43MSw5Mi44NUE2LDYsMCwxLDAsMTQ0LjE2LDIyNiwyMjcuOTQsMjI3Ljk0LDAsMCwwLDE2NiwxMjgsMzgsMzgsMCwwLDAsMTI4LDkwWm0wLTY0QTEwMi4xMSwxMDIuMTEsMCwwLDAsMjYsMTI4YTkwLDkwLDAsMCwxLTUuMTIsMzAsNiw2LDAsMSwwLDExLjMxLDRBMTAxLjgzLDEwMS44MywwLDAsMCwzOCwxMjhhOTAsOTAsMCwwLDEsMTgwLDAsMjg0LjcsMjg0LjcsMCwwLDEtNS4zMyw1NC44NCw2LDYsMCwwLDAsNC43Miw3LjA1LDYuOCw2LjgsMCwwLDAsMS4xNy4xMSw2LDYsMCwwLDAsNS44OC00Ljg0QTI5NS45MiwyOTUuOTIsMCwwLDAsMjMwLDEyOCwxMDIuMTIsMTAyLjEyLDAsMCwwLDEyOCwyNlpNOTQsMTU0LjEzYTYsNiwwLDAsMC03LjA3LDQuNjksMTUyLjgyLDE1Mi44MiwwLDAsMS0xNy40NCw0Niw2LDYsMCwwLDAsMTAuNCw2LDE2NC43NywxNjQuNzcsMCwwLDAsMTguOC00OS42NUE2LDYsMCwwLDAsOTQsMTU0LjEzWk0xMjgsNThhNzAuNzYsNzAuNzYsMCwwLDAtOC43NS41NCw2LDYsMCwxLDAsMS40OSwxMS45MUE1OCw1OCwwLDAsMSwxODYsMTI4YTI1Mi4yNywyNTIuMjcsMCwwLDEtMS45NCwzMS4yNiw2LDYsMCwwLDAsNS4yMSw2LjY5LDYuNTksNi41OSwwLDAsMCwuNzUsMCw2LDYsMCwwLDAsNS45NS01LjI2QTI2Ni40NiwyNjYuNDYsMCwwLDAsMTk4LDEyOCw3MC4wOCw3MC4wOCwwLDAsMCwxMjgsNThaTTE4NS40NCwxODYuMmE2LDYsMCwwLDAtNy4zMSw0LjMxYy0xLjQ3LDUuNzQtMy4xOCwxMS40OS01LjA2LDE3LjA5YTYsNiwwLDAsMCwxMS4zOCwzLjgyYzItNS44OCwzLjc1LTExLjksNS4zLTE3LjkyQTYsNiwwLDAsMCwxODUuNDQsMTg2LjJaIi8+PC9zdmc+",
  shield:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMDgsNDJINDhBMTQsMTQsMCwwLDAsMzQsNTZ2NTZjMCw1MS45NCwyNS4xMiw4My40LDQ2LjIsMTAwLjY0LDIyLjczLDE4LjYsNDUuMjcsMjQuODksNDYuMjIsMjUuMTVhNiw2LDAsMCwwLDMuMTYsMGMuOTUtLjI2LDIzLjQ5LTYuNTUsNDYuMjItMjUuMTVDMTk2Ljg4LDE5NS40LDIyMiwxNjMuOTQsMjIyLDExMlY1NkExNCwxNCwwLDAsMCwyMDgsNDJabTIsNzBjMCwzNy43Ni0xMy45NCw2OC4zOS00MS40NCw5MS4wNkExMzEuMTcsMTMxLjE3LDAsMCwxLDEyOCwyMjUuNzJhMTMwLjk0LDEzMC45NCwwLDAsMS00MC41Ni0yMi42NkM1OS45NCwxODAuMzksNDYsMTQ5Ljc2LDQ2LDExMlY1NmEyLDIsMCwwLDEsMi0ySDIwOGEyLDIsMCwwLDEsMiwyWk0xNzIuMjQsOTkuNzZhNiw2LDAsMCwxLDAsOC40OGwtNTYsNTZhNiw2LDAsMCwxLTguNDgsMGwtMjQtMjRhNiw2LDAsMCwxLDguNDgtOC40OEwxMTIsMTUxLjUxbDUxLjc2LTUxLjc1QTYsNiwwLDAsMSwxNzIuMjQsOTkuNzZaIi8+PC9zdmc+",
  storage:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMDgsMTM4SDQ4YTE0LDE0LDAsMCwwLTE0LDE0djQ4YTE0LDE0LDAsMCwwLDE0LDE0SDIwOGExNCwxNCwwLDAsMCwxNC0xNFYxNTJBMTQsMTQsMCwwLDAsMjA4LDEzOFptMiw2MmEyLDIsMCwwLDEtMiwySDQ4YTIsMiwwLDAsMS0yLTJWMTUyYTIsMiwwLDAsMSwyLTJIMjA4YTIsMiwwLDAsMSwyLDJaTTIwOCw0Mkg0OEExNCwxNCwwLDAsMCwzNCw1NnY0OGExNCwxNCwwLDAsMCwxNCwxNEgyMDhhMTQsMTQsMCwwLDAsMTQtMTRWNTZBMTQsMTQsMCwwLDAsMjA4LDQyWm0yLDYyYTIsMiwwLDAsMS0yLDJINDhhMiwyLDAsMCwxLTItMlY1NmEyLDIsMCwwLDEsMi0ySDIwOGEyLDIsMCwwLDEsMiwyWk0xOTAsODBhMTAsMTAsMCwxLDEtMTAtMTBBMTAsMTAsMCwwLDEsMTkwLDgwWm0wLDk2YTEwLDEwLDAsMSwxLTEwLTEwQTEwLDEwLDAsMCwxLDE5MCwxNzZaIi8+PC9zdmc+",
  language:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yNDUuMzcsMjEzLjMybC01Ni0xMTJhNiw2LDAsMCwwLTEwLjc0LDBsLTIyLjMsNDQuNkE5MCw5MCwwLDAsMSwxMDUsMTI3LjE5LDEwMS43MywxMDEuNzMsMCwwLDAsMTMzLjgyLDYySDE2MGE2LDYsMCwwLDAsMC0xMkgxMDJWMzJhNiw2LDAsMCwwLTEyLDBWNTBIMzJhNiw2LDAsMCwwLDAsMTJoODkuNzlBODkuNzEsODkuNzEsMCwwLDEsOTYsMTE5LjIzLDg5LjgxLDg5LjgxLDAsMCwxLDc1LjExLDg2LDYsNiwwLDEsMCw2My44LDkwLDEwMS42NiwxMDEuNjYsMCwwLDAsODcsMTI3LjIsODkuNTYsODkuNTYsMCwwLDEsMzIsMTQ2YTYsNiwwLDAsMCwwLDEyLDEwMS41NSwxMDEuNTUsMCwwLDAsNjQtMjIuNjMsMTAyLjExLDEwMi4xMSwwLDAsMCw1NC41MywyMi4xN2wtMjcuODksNTUuNzhhNiw2LDAsMCwwLDEwLjc0LDUuMzZMMTQ3LjcxLDE5MGg3Mi41OGwxNC4zNCwyOC42OEE2LDYsMCwwLDAsMjQwLDIyMmE1Ljg3LDUuODcsMCwwLDAsMi42OC0uNjRBNiw2LDAsMCwwLDI0NS4zNywyMTMuMzJaTTE1My43MSwxNzgsMTg0LDExNy40MiwyMTQuMjksMTc4WiIvPjwvc3ZnPg==",
  copy: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMTYsMzRIODhhNiw2LDAsMCwwLTYsNlY4Mkg0MGE2LDYsMCwwLDAtNiw2VjIxNmE2LDYsMCwwLDAsNiw2SDE2OGE2LDYsMCwwLDAsNi02VjE3NGg0MmE2LDYsMCwwLDAsNi02VjQwQTYsNiwwLDAsMCwyMTYsMzRaTTE2MiwyMTBINDZWOTRIMTYyWm00OC00OEgxNzRWODhhNiw2LDAsMCwwLTYtNkg5NFY0NkgyMTBaIi8+PC9zdmc+",
  disconnect:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0xMTgsMjE2YTYsNiwwLDAsMS02LDZINDhhNiw2LDAsMCwxLTYtNlY0MGE2LDYsMCwwLDEsNi02aDY0YTYsNiwwLDAsMSwwLDEySDU0VjIxMGg1OEE2LDYsMCwwLDEsMTE4LDIxNlptMTEwLjI0LTkyLjI0LTQwLTQwYTYsNiwwLDAsMC04LjQ4LDguNDhMMjA5LjUxLDEyMkgxMTJhNiw2LDAsMCwwLDAsMTJoOTcuNTFsLTI5Ljc1LDI5Ljc2YTYsNiwwLDEsMCw4LjQ4LDguNDhsNDAtNDBBNiw2LDAsMCwwLDIyOC4yNCwxMjMuNzZaIi8+PC9zdmc+",
  capture:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMTQsNDhWODhhNiw2LDAsMCwxLTEyLDBWNTRIMTY4YTYsNiwwLDAsMSwwLTEyaDQwQTYsNiwwLDAsMSwyMTQsNDhaTTg4LDIwMkg1NFYxNjhhNiw2LDAsMCwwLTEyLDB2NDBhNiw2LDAsMCwwLDYsNkg4OGE2LDYsMCwwLDAsMC0xMlptMTIwLTQwYTYsNiwwLDAsMC02LDZ2MzRIMTY4YTYsNiwwLDAsMCwwLDEyaDQwYTYsNiwwLDAsMCw2LTZWMTY4QTYsNiwwLDAsMCwyMDgsMTYyWk04OCw0Mkg0OGE2LDYsMCwwLDAtNiw2Vjg4YTYsNiwwLDAsMCwxMiwwVjU0SDg4YTYsNiwwLDAsMCwwLTEyWiIvPjwvc3ZnPg==",
  airplane:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0yMzQuNjgsMTMwLjYzLDE1OCw5Mi4yOVY0OGEzMCwzMCwwLDAsMC02MCwwVjkyLjI5TDIxLjMyLDEzMC42M0E2LDYsMCwwLDAsMTgsMTM2djMyYTYsNiwwLDAsMCw3LjE4LDUuODhMOTgsMTU5LjMydjIyLjE5TDgzLjc2LDE5NS43NkE2LDYsMCwwLDAsODIsMjAwdjMyYTYsNiwwLDAsMCw4LjIzLDUuNTdMMTI4LDIyMi40NmwzNy43NywxNS4xMUE2LDYsMCwwLDAsMTc0LDIzMlYyMDBhNiw2LDAsMCwwLTEuNzYtNC4yNEwxNTgsMTgxLjUxVjE1OS4zMmw3Mi44MiwxNC41NkE2LDYsMCwwLDAsMjM4LDE2OFYxMzZBNiw2LDAsMCwwLDIzNC42OCwxMzAuNjNaTTIyNiwxNjAuNjhsLTcyLjgyLTE0LjU2QTYsNiwwLDAsMCwxNDYsMTUydjMyYTYsNiwwLDAsMCwxLjc2LDQuMjRMMTYyLDIwMi40OXYyMC42NWwtMzEuNzctMTIuNzFhNiw2LDAsMCwwLTQuNDYsMEw5NCwyMjMuMTRWMjAyLjQ5bDE0LjI0LTE0LjI1QTYsNiwwLDAsMCwxMTAsMTg0VjE1MmE2LDYsMCwwLDAtNy4xOC01Ljg4TDMwLDE2MC42OHYtMjFsNzYuNjgtMzguMzRBNiw2LDAsMCwwLDExMCw5NlY0OGExOCwxOCwwLDAsMSwzNiwwVjk2YTYsNiwwLDAsMCwzLjMyLDUuMzdMMjI2LDEzOS43MVoiLz48L3N2Zz4=",
  volume:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNTYgMjU2IiBmaWxsPSJjdXJyZW50Q29sb3IiPjxwYXRoIGQ9Ik0xNTQuNjQsMjYuNjFhNiw2LDAsMCwwLTYuMzIuNjVMNzcuOTQsODJIMzJBMTQsMTQsMCwwLDAsMTgsOTZ2NjRhMTQsMTQsMCwwLDAsMTQsMTRINzcuOTRsNzAuMzgsNTQuNzRBNiw2LDAsMCwwLDE1OCwyMjRWMzJBNiw2LDAsMCwwLDE1NC42NCwyNi42MVpNMzAsMTYwVjk2YTIsMiwwLDAsMSwyLTJINzR2NjhIMzJBMiwyLDAsMCwxLDMwLDE2MFptMTE2LDUxLjczTDg2LDE2NS4wN1Y5MC45M2w2MC00Ni42NlptNTAuNTMtMTA4Ljg1YTM4LDM4LDAsMCwxLDAsNTAuMjQsNiw2LDAsMSwxLTktNy45NCwyNiwyNiwwLDAsMCwwLTM0LjM3LDYsNiwwLDAsMSw5LTcuOTNaTTI0NiwxMjhhNzcuODYsNzcuODYsMCwwLDEtMTkuODYsNTIsNiw2LDAsMSwxLTguOTQtOCw2Niw2NiwwLDAsMCwwLTg4LDYsNiwwLDEsMSw4Ljk0LThBNzcuODYsNzcuODYsMCwwLDEsMjQ2LDEyOFoiLz48L3N2Zz4=",
} as const;
type SystemSymbol = keyof typeof OS_SYMBOLS;
function SystemIcon({ id }: { id: SystemSymbol }): ReactElement {
  return (
    <span
      className="device__symbol"
      aria-hidden="true"
      style={{
        maskImage: `url("${OS_SYMBOLS[id]}")`,
        WebkitMaskImage: `url("${OS_SYMBOLS[id]}")`,
      }}
    />
  );
}

function DeviceBrand(): ReactElement {
  return (
    <div className="device__brandmark">
      <ResponsiveImage
        src="/images/brand/breaker-os-presentation.png"
        alt="BREAKER OS"
        sizes="200px"
        loading="lazy"
      />
    </div>
  );
}

const SPEAKER: Record<Speaker, string> = {
  mara: "MARA VALE",
  breaker: "BREAKER",
  system: "SYSTEM",
  custodian: "THE CUSTODIAN",
  voss: "AREN VOSS",
  architect: "THE ARCHITECT",
};

const seenKey = (player: string | undefined, levelId: number): string =>
  `breaker.os.seen.${player ?? "anon"}.${levelId}`;

const viewKey = (player: string | undefined, levelId: number): string =>
  `breaker.os.app.${player ?? "anon"}.${levelId}`;

function loadSeen(player: string | undefined, levelId: number): Seen {
  try {
    const raw = window.localStorage.getItem(seenKey(player, levelId));
    if (raw === null) return { ...SEEN_EMPTY };
    const parsed = JSON.parse(raw) as Partial<Seen>;
    const read = (value: unknown): number =>
      typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.trunc(value))
        : 0;
    const contacts: Partial<Record<ContactSpeaker, number>> = {};
    for (const contact of ["mara", "custodian", "voss", "architect"] as const) {
      if (
        typeof parsed.contacts === "object" &&
        parsed.contacts !== null &&
        Object.hasOwn(parsed.contacts, contact)
      )
        contacts[contact] = read(parsed.contacts[contact]);
    }
    return {
      comms: read(parsed.comms),
      evidence: read(parsed.evidence),
      terminal: read(parsed.terminal),
      investigation: read(parsed.investigation),
      story: read(parsed.story),
      ...(Object.keys(contacts).length ? { contacts } : {}),
    };
  } catch {
    return { ...SEEN_EMPTY };
  }
}

export function homeNotificationCount(player: string | undefined): number {
  return Math.max(0, 1 - loadSeen(player, -1).comms);
}

function saveSeen(
  player: string | undefined,
  levelId: number,
  seen: Seen,
): void {
  try {
    window.localStorage.setItem(seenKey(player, levelId), JSON.stringify(seen));
  } catch {
    void 0;
  }
}

function loadView(player: string | undefined, levelId: number): View {
  try {
    const raw = window.localStorage.getItem(viewKey(player, levelId));
    return raw !== null && (raw === "home" || APP_IDS.has(raw))
      ? (raw as View)
      : "investigation";
  } catch {
    return "investigation";
  }
}

function saveView(
  player: string | undefined,
  levelId: number,
  view: View,
): void {
  try {
    window.localStorage.setItem(viewKey(player, levelId), view);
  } catch {
    void 0;
  }
}

function short(value: string | undefined): string {
  if (value === undefined || value.length <= 10) return value ?? "—";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

const CLOCK_SEGMENTS = [
  "M7 4h18",
  "M28 7v18",
  "M28 33v18",
  "M7 54h18",
  "M4 33v18",
  "M4 7v18",
  "M7 29h18",
] as const;
const CLOCK_DIGITS = [
  "012345",
  "12",
  "01643",
  "01263",
  "5612",
  "05623",
  "054623",
  "012",
  "0123456",
  "012356",
] as const;

function DigitalClock({ time }: { time: string }): ReactElement {
  return (
    <time className="device__digital-clock" aria-label={time}>
      <span aria-hidden="true">
        {Array.from(time).map((digit, index) =>
          digit === ":" ? (
            <svg
              className="device__clock-colon"
              key={index}
              viewBox="0 0 10 58"
            >
              <rect x="3" y="19" width="4" height="4" />
              <rect x="3" y="36" width="4" height="4" />
            </svg>
          ) : (
            <svg
              key={index}
              viewBox="0 0 32 58"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="square"
            >
              {CLOCK_SEGMENTS.map((path, segment) => (
                <path
                  key={segment}
                  d={path}
                  opacity={
                    CLOCK_DIGITS[Number(digit)]?.includes(String(segment))
                      ? 1
                      : 0.07
                  }
                />
              ))}
            </svg>
          ),
        )}
      </span>
    </time>
  );
}

export function BreakerDevice({
  level,
  narrative,
  player,
  instance,
  caseFile,
  solved,
  open,
  onToggle,
  caseState,
  focus,
  contractSpec,
  onCreateInstance,
  creatingInstance = false,
}: {
  level: Level | null;
  narrative: Narrative | null;
  player: string | undefined;
  instance: string | undefined;
  caseFile: CaseFileData | null;
  solved: boolean;
  open: boolean;
  onToggle: () => void;
  caseState: CaseNarrative;
  focus: OsFocus | null;
  contractSpec: readonly Descriptor[];
  onCreateInstance?: (() => void) | undefined;
  creatingInstance?: boolean | undefined;
}): ReactElement {
  const { t, language, toggleLanguage } = useLanguage();

  const levelId = level?.id ?? -1;
  const currentKey = `${player ?? "anon"}:${levelId}`;
  const mobileGameplay = useMobileGameplay();
  const [view, setView] = useState<View>(() =>
    level === null ? "home" : loadView(player, levelId),
  );
  const [operationCells, setOperationCells] = useState(() =>
    loadOperationDraft(player, levelId),
  );
  const [operationCellRuns, setOperationCellRuns] = useState<
    Record<string, OperationCellRun>
  >({});
  const [methodVariantSelections, setMethodVariantSelections] = useState<
    Record<string, string>
  >({});
  const [activeCellId, setActiveCellId] = useState(
    () => operationCells[0]?.id ?? "cell-1",
  );
  const [runningCellId, setRunningCellId] = useState<string | null>(null);
  const operationEditors = useRef<Record<string, HTMLTextAreaElement | null>>(
    {},
  );
  const [screenLocked, setScreenLocked] = useState(true);
  const [scanPhase, setScanPhase] = useState<"idle" | "reading" | "accepted">(
    "idle",
  );
  const [unlockTarget, setUnlockTarget] = useState<View>("home");
  const fingerprintRef = useRef<HTMLButtonElement | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [chat, setChat] = useState<ChatExchange[]>([]);
  const [chatThreadOpen, setChatThreadOpen] = useState(false);
  const [chatContact, setChatContact] = useState<ContactSpeaker>("mara");
  const [typingReplyId, setTypingReplyId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [caseStory, setCaseStory] = useState<CaseStory | null>(null);
  const [storyStep, setStoryStep] = useState(0);
  const [archiveDocuments, setArchiveDocuments] = useState<
    readonly NarrativeDocument[]
  >([]);
  const conversations = conversationBeats(narrative, caseState.fired);
  const [query, setQuery] = useState("");
  const [notificationFilter, setNotificationFilter] = useState<
    "all" | "comms" | "system" | "cases"
  >("all");
  const [brightness, setBrightness] = useState(100);
  const [operatingMode, setOperatingMode] = useState<
    "normal" | "focus" | "quiet"
  >("normal");
  const [accent, setAccent] = useState<"green" | "cyan">("green");
  const [wallpaper, setWallpaper] = useState(true);
  const [previews, setPreviews] = useState(true);
  const [flashlight, setFlashlight] = useState(false);
  const [settingSection, setSettingSection] = useState<
    | "main"
    | "appearance"
    | "notifications"
    | "privacy"
    | "network"
    | "storage"
    | "about"
  >("main");
  const [systemMessage, setSystemMessage] = useState("");
  const [sceneToggles, setSceneToggles] = useState({
    wifi: true,
    bluetooth: false,
    airplane: false,
  });
  const [settingsPlayer, setSettingsPlayer] = useState<string | null>(null);
  const [seen, setSeen] = useState<Seen>(() => loadSeen(player, levelId));
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const deviceRef = useRef<HTMLElement | null>(null);
  const appbarBackRef = useRef<HTMLButtonElement | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartScrollTop = useRef(0);

  useEffect(() => {
    const cells = loadOperationDraft(player, levelId);
    setOperationCells(cells);
    setActiveCellId(cells[0]?.id ?? "cell-1");
    setOperationCellRuns({});
    setRunningCellId(null);
    setMethodVariantSelections({});
  }, [currentKey, levelId, player]);

  useEffect(() => {
    try {
      const raw = JSON.parse(
        localStorage.getItem(`breaker.os.preferences.${player ?? "anon"}`) ??
          "null",
      ) as unknown;
      if (typeof raw === "object" && raw !== null) {
        if ("brightness" in raw && typeof raw.brightness === "number")
          setBrightness(Math.max(35, Math.min(100, raw.brightness)));
        if ("wallpaper" in raw && typeof raw.wallpaper === "boolean")
          setWallpaper(raw.wallpaper);
        if ("previews" in raw && typeof raw.previews === "boolean")
          setPreviews(raw.previews);
        if (
          "accent" in raw &&
          (raw.accent === "green" || raw.accent === "cyan")
        )
          setAccent(raw.accent);
        if (
          "mode" in raw &&
          (raw.mode === "normal" ||
            raw.mode === "focus" ||
            raw.mode === "quiet")
        )
          setOperatingMode(raw.mode);
      } else {
        setBrightness(100);
        setWallpaper(true);
        setPreviews(true);
        setAccent("green");
        setOperatingMode("normal");
      }
    } catch {
      setBrightness(100);
      setWallpaper(true);
      setPreviews(true);
      setAccent("green");
      setOperatingMode("normal");
    }
    setSettingsPlayer(player ?? "anon");
  }, [player]);

  useEffect(() => {
    if (settingsPlayer !== (player ?? "anon")) return;
    try {
      localStorage.setItem(
        `breaker.os.preferences.${player ?? "anon"}`,
        JSON.stringify({
          brightness,
          wallpaper,
          previews,
          accent,
          mode: operatingMode,
        }),
      );
    } catch {}
  }, [
    settingsPlayer,
    player,
    brightness,
    wallpaper,
    previews,
    accent,
    operatingMode,
  ]);

  useEffect(() => {
    if (
      view === "home" ||
      view === "launcher" ||
      view === "controls" ||
      view === "quick" ||
      view === "search" ||
      view === "operator"
    )
      return;
  }, [view]);

  useEffect(() => {
    setQuery("");
  }, [currentKey]);

  useEffect(() => {
    if (level === null) {
      setCaseStory(null);
      return;
    }

    let alive = true;
    setStoryStep(0);
    void loadStory(level.id).then((loaded) => {
      if (alive) setCaseStory(loaded);
    });
    return () => {
      alive = false;
    };
  }, [level]);

  useEffect(() => {
    if (level?.id !== 12) {
      setArchiveDocuments([]);
      return;
    }

    let alive = true;
    void Promise.all([
      loadNarrative(3),
      loadNarrative(4),
      loadNarrative(8),
    ]).then((records) => {
      if (!alive) return;
      const [warehouse, floor, sector] = records;
      const selected = [
        warehouse?.documents?.find(
          (document) => document.id === "03-document-1",
        ),
        floor?.documents?.find((document) => document.id === "04-document-1"),
        sector?.documents?.find((document) => document.id === "08-document-0"),
      ].filter(
        (document): document is NarrativeDocument => document !== undefined,
      );
      setArchiveDocuments(selected);
    });
    return () => {
      alive = false;
    };
  }, [level?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (viewport === null || viewport === undefined) return;
    const reveal = (): void => {
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        deviceRef.current?.contains(active) === true &&
        active.closest(".device__notebook-cell") !== null
      ) {
        revealEditor(active);
      }
    };
    viewport.addEventListener("resize", reveal);
    return () => viewport.removeEventListener("resize", reveal);
  }, []);

  useEffect(() => {
    setScanPhase("idle");
    setUnlockTarget("home");
  }, [currentKey, open]);

  useEffect(() => {
    if (!open || screenLocked || notificationsOpen || view === "home") return;
    appbarBackRef.current?.focus();
  }, [view, open, screenLocked, notificationsOpen]);

  useEffect(() => {
    if (!open || !screenLocked || scanPhase === "idle") return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () => {
        if (scanPhase === "reading") {
          setScanPhase("accepted");
        } else {
          setScreenLocked(false);
          setNotificationsOpen(false);
          setView(unlockTarget);
          setScanPhase("idle");
        }
      },
      reduced ? 120 : scanPhase === "reading" ? 700 : 350,
    );
    return () => window.clearTimeout(timer);
  }, [open, screenLocked, scanPhase, unlockTarget]);

  useEffect(() => {
    if (!open || level === null) return;
    const outside = (event: PointerEvent): void => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-breaker-os-toggle]")
      )
        return;
      if (
        event.target instanceof Node &&
        !deviceRef.current?.contains(event.target)
      )
        onToggle();
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onToggle();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, level, onToggle]);

  useEffect(() => {
    if (level === null) return;
    window.dispatchEvent(
      new CustomEvent("breaker:visibility", { detail: { open } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("breaker:visibility", { detail: { open: false } }),
      );
    };
  }, [open, level]);

  useEffect(() => {
    if (
      !open ||
      screenLocked ||
      notificationsOpen ||
      operatingMode !== "normal" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const node = bodyRef.current;
    if (!node?.animate) return;
    const animation = node.animate(
      [
        { opacity: 0.55, transform: "translateY(10px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 190, easing: "cubic-bezier(.16, 1, .3, 1)" },
    );
    return () => animation.cancel();
  }, [view, notificationsOpen, screenLocked, open, operatingMode]);

  const time = now.toLocaleTimeString(language, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  });

  const counts = {
    comms: level === null ? 1 : caseState.fired.length,
    evidence: caseState.revealed.size,
    terminal: caseState.calls.length,
  };

  useEffect(() => {
    setView(level === null ? "home" : loadView(player, levelId));
    setSeen(loadSeen(player, levelId));
    setLoadedKey(currentKey);
    setChat([]);
    setChatContact("mara");
    setTypingReplyId(null);
    setChatThreadOpen(false);
    setSelectedDocument(null);
    setScreenLocked(true);
    setNotificationsOpen(false);
  }, [currentKey, player, levelId, level]);

  useEffect(() => {
    if (loadedKey === currentKey) saveView(player, levelId, view);
  }, [loadedKey, currentKey, player, levelId, view]);

  useEffect(() => {
    if (loadedKey === currentKey) saveSeen(player, levelId, seen);
  }, [loadedKey, currentKey, player, levelId, seen]);

  useEffect(() => {
    if (focus !== null) {
      setView(focus.app);
      if (focus.app === "comms") setChatThreadOpen(true);
      if (focus.app !== "home") {
        setScreenLocked(false);
        setNotificationsOpen(false);
      }
    }
  }, [focus]);

  useEffect(() => {
    if (
      !open ||
      screenLocked ||
      notificationsOpen ||
      (view !== "comms" && view !== "evidence" && view !== "terminal")
    ) {
      return;
    }

    if (view === "comms") {
      if (!chatThreadOpen) return;
      const current =
        level === null ? 1 : (conversations.get(chatContact)?.length ?? 0);
      setSeen((previous) =>
        previous.contacts?.[chatContact] === current
          ? previous
          : {
              ...previous,
              comms: level === null ? current : previous.comms,
              contacts: { ...previous.contacts, [chatContact]: current },
            },
      );
      return;
    }
    const current = counts[view];
    setSeen((previous) =>
      previous[view] === current ? previous : { ...previous, [view]: current },
    );
  }, [
    open,
    screenLocked,
    notificationsOpen,
    view,
    chatThreadOpen,
    chatContact,
    narrative,
    level,
    caseState.fired,
    counts.comms,
    counts.evidence,
    counts.terminal,
  ]);

  useEffect(() => {
    if (!open || screenLocked || notificationsOpen) return;
    if (view === "investigation") {
      setSeen((previous) =>
        previous.investigation === 1
          ? previous
          : { ...previous, investigation: 1 },
      );
    }
    if (view === "story" && solved) {
      setSeen((previous) =>
        previous.story === 1 ? previous : { ...previous, story: 1 },
      );
    }
  }, [open, screenLocked, notificationsOpen, view, solved]);

  useEffect(() => {
    if (
      !open ||
      screenLocked ||
      notificationsOpen ||
      view !== "comms" ||
      !chatThreadOpen
    )
      return;
    const node = bodyRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [
    open,
    screenLocked,
    notificationsOpen,
    view,
    chatThreadOpen,
    caseState.fired.length,
    caseState.choices,
    chat.length,
    chatContact,
  ]);

  const unread = (app: OsAppId): number => {
    if (app === "comms")
      return level === null
        ? Math.max(0, 1 - seen.comms)
        : [...conversations].reduce(
            (sum, [contact, indices]) =>
              sum +
              Math.max(
                0,
                indices.length -
                  (seen.contacts?.[contact] ??
                    indices.filter(
                      (index) => caseState.fired.indexOf(index) < seen.comms,
                    ).length),
              ),
            0,
          );
    if (app === "evidence") return Math.max(0, counts.evidence - seen.evidence);
    if (app === "terminal") return Math.max(0, counts.terminal - seen.terminal);
    return 0;
  };

  const dossierUnread =
    level === null ? 0 : Math.max(0, 1 - seen.investigation);
  const storyUnread =
    level === null || !solved ? 0 : Math.max(0, 1 - seen.story);
  const totalUnread =
    unread("comms") +
    unread("evidence") +
    unread("terminal") +
    dossierUnread +
    storyUnread;
  useEffect(() => {
    if (loadedKey !== currentKey) return;
    window.dispatchEvent(
      new CustomEvent("breaker:unread", {
        detail: { levelId, count: totalUnread },
      }),
    );
    return () => {
      if (levelId >= 0)
        window.dispatchEvent(
          new CustomEvent("breaker:unread", { detail: { levelId, count: 0 } }),
        );
    };
  }, [levelId, totalUnread, loadedKey, currentKey]);

  const locked = (app: OsAppId): boolean => app === "story" && !solved;

  const pick = (text: NarrativeText): string => text[language] ?? text["pt-BR"];

  const fill = (text: string): string =>
    text
      .replaceAll("{player}", player ?? "NO PLAYER")
      .replaceAll("{instance}", instance ?? "NO INSTANCE");

  const homeText = (key: string): NarrativeText => ({
    "pt-BR": TEXTS["pt-BR"][key] ?? key,
    en: TEXTS.en[key] ?? key,
    es: TEXTS.es[key] ?? key,
  });
  const replies: readonly DialogueReply[] =
    level === null
      ? [
          {
            id: "home-city",
            contact: "mara",
            trigger: "start",
            label: homeText("device.chat.askCity"),
            response: homeText("device.chat.city"),
          },
          {
            id: "home-cases",
            contact: "mara",
            trigger: "start",
            label: homeText("device.chat.askCases"),
            response: homeText("device.chat.homeCases"),
          },
          {
            id: "home-start",
            contact: "mara",
            trigger: "start",
            label: homeText("device.chat.askStart"),
            response: homeText("device.chat.homeReply"),
          },
        ]
      : (narrative?.replies ?? []);
  const availableReplies = availableDialogueReplies(
    replies,
    narrative,
    caseState.fired,
    chat,
    chatContact,
  );
  const sendChat = (optionId: string): void => {
    if (loadedKey !== currentKey) return;
    const option = availableReplies.find((reply) => reply.id === optionId);
    if (!option) return;
    const next = sendDialogueReply(
      chat,
      replies,
      narrative,
      caseState.fired,
      chatContact,
      optionId,
    );
    const exchange = next.at(-1);
    if (!exchange || exchange.optionId !== optionId) return;
    setChat(next);
    setTypingReplyId(exchange.id);
  };
  useEffect(() => {
    if (typingReplyId === null) return;
    const timer = window.setTimeout(() => setTypingReplyId(null), 720);
    return () => window.clearTimeout(timer);
  }, [typingReplyId]);
  const chatTurns = (after: number): ReactElement[] =>
    chat
      .filter(
        (item) =>
          (item.contact ?? "mara") === chatContact &&
          Math.min(item.after, caseState.fired.length) === after,
      )
      .map((item) => (
        <div className="device__chat-exchange" key={item.id}>
          <article className="os__message os__message--breaker">
            <span className="os__speaker">BREAKER</span>
            <p className="os__text">
              {fill(item.label ? pick(item.label) : item.text)}
            </p>
          </article>
          <article
            className={`os__message os__message--${chatContact}`}
            aria-busy={typingReplyId === item.id}
          >
            <span className="os__speaker">{SPEAKER[chatContact]}</span>
            {typingReplyId === item.id ? (
              <span className="device__typing" aria-label="Digitando">
                <i />
                <i />
                <i />
              </span>
            ) : (
              <p className="os__text">{fill(pick(item.reply))}</p>
            )}
          </article>
        </div>
      ));

  if (!open) {
    return (
      <button
        type="button"
        className="os-toggle"
        onClick={onToggle}
        aria-expanded={false}
        aria-controls="breaker-os"
        aria-label={t("device.open")}
      >
        {totalUnread > 0 && (
          <span className="os-toggle__dot" aria-hidden="true" />
        )}
        BREAKER OS
        {totalUnread > 0 && (
          <span
            className="os-toggle__count"
            aria-label={t("device.unread", { count: totalUnread })}
          >
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>
    );
  }

  const app = APPS.find((entry) => entry.id === view);

  const comms = () => {
    if (!chatThreadOpen) {
      return (
        <div className="device__chat-inbox">
          <p className="device__note">{t("device.chat.conversationsBody")}</p>
          {[...conversations].map(([contact, indices]) => {
            const latest = narrative?.beats[indices.at(-1) ?? -1];
            const history = chat.filter(
              (item) => (item.contact ?? "mara") === contact,
            );
            const lastReply = history.at(-1);
            const preview = lastReply
              ? pick(lastReply.reply)
              : latest
                ? fill(pick(latest.text))
                : t(
                    level === null
                      ? "device.chat.homeWelcome"
                      : "device.chat.noMessages",
                  );
            const read =
              seen.contacts?.[contact] ??
              indices.filter(
                (index) => caseState.fired.indexOf(index) < seen.comms,
              ).length;
            const count =
              level === null
                ? unread("comms")
                : Math.max(0, indices.length - read);
            return (
              <button
                key={contact}
                type="button"
                className="device__chat-thread"
                onClick={() => {
                  setChatContact(contact);
                  setChatThreadOpen(true);
                }}
              >
                <span className="device__chat-avatar" aria-hidden="true">
                  {SPEAKER[contact]
                    .split(" ")
                    .map((word) => word[0])
                    .join("")}
                </span>
                <span className="device__chat-thread-copy">
                  <strong>{SPEAKER[contact]}</strong>
                  <small>{preview}</small>
                </span>
                {count > 0 && (
                  <span className="device__chat-unread">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      );
    }
    if (level === null)
      return (
        <>
          <p className="device__chat-context">{t("device.chat.homeContext")}</p>
          <article className="os__message os__message--mara">
            <span className="os__speaker">MARA VALE</span>
            <p className="os__text">{t("device.chat.homeWelcome")}</p>
          </article>
          {chatTurns(0)}
        </>
      );
    if (narrative === null)
      return <p className="device__empty">{t("device.chat.connecting")}</p>;

    const anchors = choiceAnchors(caseState.fired, narrative);

    const choice = (item: NarrativeChoice): ReactElement | null => {
      const prompt = (
        <article
          className="os__message os__message--mara"
          key={`${item.id}-prompt`}
        >
          <span className="os__speaker">{SPEAKER.mara}</span>
          <p className="os__text">{fill(pick(item.prompt))}</p>
        </article>
      );

      const chosen = caseState.choices[item.id];

      if (chosen === undefined) {
        return (
          <Fragment key={item.id}>
            {prompt}
            <div className="os__choice">
              {item.options.map((option) => (
                <button
                  key={option.tone}
                  type="button"
                  className="os__choice-option"
                  onClick={() => caseState.chooseTone(item.id, option.tone)}
                >
                  {fill(pick(option.label))}
                </button>
              ))}
            </div>
          </Fragment>
        );
      }

      const option = item.options.find((entry) => entry.tone === chosen);
      if (option === undefined) return null;

      return (
        <Fragment key={item.id}>
          {prompt}
          <article className="os__message os__message--breaker">
            <span className="os__speaker">{SPEAKER.breaker}</span>
            <p className="os__text">{fill(pick(option.label))}</p>
          </article>
          <article className="os__message os__message--mara">
            <span className="os__speaker">{SPEAKER.mara}</span>
            <p className="os__text">{fill(pick(option.response))}</p>
          </article>
        </Fragment>
      );
    };

    return (
      <>
        <p className="device__chat-context">
          {choose(level.name, language)?.text}
        </p>
        {chatTurns(0)}
        {caseState.fired.map((index, position) => {
          const beat = narrative.beats[index];
          if (beat === undefined) return null;

          const text = fill(pick(beat.text));
          const cards = anchors.get(position) ?? [];

          return (
            <Fragment key={`${index}-${beat.trigger}`}>
              {conversations.get(chatContact)?.includes(index) && (
                <article
                  className={`os__message os__message--${beat.speaker}`}
                >
                  <span className="os__speaker">{SPEAKER[beat.speaker]}</span>
                  <p className="os__text">{text}</p>
                </article>
              )}
              {chatContact === "mara" && cards.map(choice)}
              {chatTurns(position + 1)}
            </Fragment>
          );
        })}
      </>
    );
  };

  const evidence = () => {
    const items =
      narrative === null
        ? []
        : narrative.evidence.filter((item) => caseState.revealed.has(item.id));
    const recovered = archiveDocuments.map((document) => ({
      id: `archive:${document.id}`,
      label: document.title,
      value: document.source,
      documentId: document.id,
    }));
    const allItems = [...items, ...recovered];

    if (allItems.length === 0) {
      return <p className="device__empty">{t("device.empty.evidence")}</p>;
    }

    return (
      <ul className="os__evidence">
        {allItems.map((item) => (
          <li className="os__evidence-item" key={item.id}>
            <span className="os__label">{fill(pick(item.label))}</span>
            <span className="os__value">{fill(pick(item.value))}</span>
            {item.documentId && (
              <button
                type="button"
                className="device__text-button"
                onClick={() => {
                  setSelectedDocument(item.documentId ?? null);
                  navigateOS("files");
                }}
              >
                {t("device.document.open")}
              </button>
            )}
          </li>
        ))}
      </ul>
    );
  };

  const documents = () => {
    const items = [
      ...(narrative?.documents ?? []).filter((item) =>
        caseState.revealed.has(item.id),
      ),
      ...archiveDocuments,
    ];
    if (items.length === 0)
      return <p className="device__empty">{t("device.document.empty")}</p>;
    return (
      <div className="device__stack device__documents">
        {items.map((item) => (
          <details
            key={item.id}
            open={selectedDocument === item.id || undefined}
          >
            <summary>{fill(pick(item.title))}</summary>
            <p className="device__note">
              {t("device.document.source")}: {pick(item.source)}
            </p>
            {item.body.map((paragraph, index) => (
              <p key={index}>{fill(pick(paragraph))}</p>
            ))}
          </details>
        ))}
      </div>
    );
  };

  const terminal = () => {
    if (caseState.calls.length === 0) {
      return <p className="device__empty">{t("device.empty.terminal")}</p>;
    }

    return (
      <ol className="os__terminal">
        {caseState.calls
          .slice()
          .reverse()
          .map((call) => (
            <li
              className={`os__call os__call--${call.outcome}`}
              key={call.id}
              aria-busy={call.outcome === "pending" ? true : undefined}
            >
              <span className="os__call-method">{call.method}</span>
              <span className="os__call-kind">{call.kind}</span>
              <span className="os__call-outcome">
                {call.outcome === "failed"
                  ? t(`device.terminal.failure.${call.failure ?? "unknown"}`)
                  : t(`device.terminal.outcome.${call.outcome}`)}
              </span>
            </li>
          ))}
      </ol>
    );
  };

  const story = () => {
    if (!solved || level === null) {
      return (
        <div className="device__locked">
          <h3>{t("device.locked")}</h3>
          <p>{t("device.lockedStory")}</p>
        </div>
      );
    }

    const scenes = caseStory?.scenes ?? [];
    const scene = scenes[storyStep];
    const next = LEVELS[LEVELS.findIndex((entry) => entry.id === level.id) + 1];

    return (
      <div className="device__stack">
        {next !== undefined && (
          <>
            <p className="device__note">{t("device.story.next")}</p>
            <Link className="device__link" to={`/level/${next.id}`}>
              {t("levelHero.continueStory")}
            </Link>
          </>
        )}
        {next === undefined && (
          <>
            <p className="device__note">{t("device.story.next")}</p>
            <Link className="device__link" to="/final">
              {t("levelHero.continueStory")}
            </Link>
          </>
        )}
        <p className="device__note">{t("device.story.body")}</p>
        {scene === undefined ? (
          <p className="device__empty">{t("story.missing")}</p>
        ) : (
          <>
            <article className="device__story-scene">
              <span className="device__story-progress">
                {t("story.progress", {
                  current: storyStep + 1,
                  total: scenes.length,
                })}
              </span>
              <h3>{pick(scene.title)}</h3>
              {scene.paragraphs.map((paragraph, index) => (
                <p key={index}>{fill(pick(paragraph))}</p>
              ))}
            </article>
            <div className="device__actions">
              {storyStep > 0 && (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setStoryStep((step) => step - 1)}
                >
                  {t("story.previous")}
                </button>
              )}
              {storyStep < scenes.length - 1 ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => setStoryStep((step) => step + 1)}
                >
                  {t("story.continue")}
                </button>
              ) : (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setStoryStep(0)}
                >
                  {t("story.restart")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const help = () => (
    <div className="device__stack device__help">
      <HelpGuide mobileGameplay={mobileGameplay} />
      <div className="device__actions">
        <button
          type="button"
          className="button button--secondary"
          onClick={() => toggleLanguage(nextLanguage(language))}
        >
          {t("device.help.language")}
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            caseState.clear();
            setChat([]);
          }}
        >
          {t("device.help.clear")}
        </button>
      </div>
    </div>
  );

  const updateOperationSource = (cellId: string, source: string): void => {
    const nextCells = operationCells.map((cell) =>
      cell.id === cellId
        ? {
            id: cell.id,
            source,
          }
        : cell,
    );
    setOperationCells(nextCells);
    saveOperationDraft(player, levelId, nextCells);
    setOperationCellRuns((previous) => {
      const next = { ...previous };
      delete next[cellId];
      return next;
    });
  };

  const insertOperationText = (
    text: string,
    cursorOffset = text.length,
  ): void => {
    const cell =
      operationCells.find((item) => item.id === activeCellId) ??
      operationCells[0];
    if (cell === undefined) return;
    const editor = operationEditors.current[cell.id];
    const start = editor?.selectionStart ?? cell.source.length;
    const end = editor?.selectionEnd ?? start;
    const next = `${cell.source.slice(0, start)}${text}${cell.source.slice(end)}`;
    updateOperationSource(cell.id, next);
    requestAnimationFrame(() => {
      editor?.focus();
      editor?.setSelectionRange(start + cursorOffset, start + cursorOffset);
    });
  };

  const insertOperationCell = (
    source: string,
    cursorOffset = source.length,
  ): void => {
    const activeCell =
      operationCells.find((cell) => cell.id === activeCellId) ??
      operationCells[0];
    if (activeCell === undefined || activeCell.source.trim() !== "") {
      const cell = { ...freshOperationCell(), source };
      const nextCells = [...operationCells, cell];
      setOperationCells(nextCells);
      saveOperationDraft(player, levelId, nextCells);
      setActiveCellId(cell.id);
      requestAnimationFrame(() => {
        const editor = operationEditors.current[cell.id];
        editor?.focus();
        editor?.setSelectionRange(cursorOffset, cursorOffset);
      });
      return;
    }
    updateOperationSource(activeCell.id, source);
    setActiveCellId(activeCell.id);
    requestAnimationFrame(() => {
      const editor = operationEditors.current[activeCell.id];
      editor?.focus();
      editor?.setSelectionRange(cursorOffset, cursorOffset);
    });
  };

  const addOperationCell = (): void => {
    const cell = freshOperationCell();
    const nextCells = [...operationCells, cell];
    setOperationCells(nextCells);
    saveOperationDraft(player, levelId, nextCells);
    setActiveCellId(cell.id);
    requestAnimationFrame(() => operationEditors.current[cell.id]?.focus());
  };

  const clearOperationCell = (cellId: string): void => {
    updateOperationSource(cellId, "");
    operationEditors.current[cellId]?.focus();
  };

  const deleteOperationCell = (cellId: string): void => {
    if (operationCells.length === 1) {
      clearOperationCell(cellId);
      return;
    }
    const nextCells = operationCells.filter((cell) => cell.id !== cellId);
    setOperationCells(nextCells);
    saveOperationDraft(player, levelId, nextCells);
    setOperationCellRuns((previous) => {
      const next = { ...previous };
      delete next[cellId];
      return next;
    });
    if (activeCellId === cellId) setActiveCellId(nextCells[0]?.id ?? "cell-1");
  };

  const executeOperationCell = async (cell: OperationCell): Promise<boolean> => {
    if (!instance || cell.source.trim() === "") return false;
    const startedAt = Date.now();
    let lastCallAt = startedAt;
    let callsStarted = 0;
    let callsCompleted = 0;
    const seenCalls = new Set<number>();
    const finishedCalls = new Set<number>();
    setRunningCellId(cell.id);
    setOperationCellRuns((previous) => ({
      ...previous,
      [cell.id]: {
        status: "running",
        output: null,
        progress: t("device.operations.progress.starting"),
        startedAt,
        elapsedSeconds: 0,
        callsStarted: 0,
        callsCompleted: 0,
      },
    }));
    const updateRunningCell = (patch: Partial<OperationCellRun>): void => {
      setOperationCellRuns((previous) => {
        const current = previous[cell.id];
        if (current?.status !== "running") return previous;
        return { ...previous, [cell.id]: { ...current, ...patch } };
      });
    };
    const unsubscribe = subscribe((event) => {
      if (event.type !== "call") return;
      lastCallAt = Date.now();
      if (event.outcome === "pending" && event.kind === "call" && !seenCalls.has(event.id)) {
        seenCalls.add(event.id);
        callsStarted += 1;
        updateRunningCell({
          callsStarted,
          progress: t("device.operations.progress.call", {
            number: String(callsStarted),
            method: event.method,
          }),
        });
        return;
      }
      if (event.outcome === "pending" && event.kind === "write") {
        updateRunningCell({
          progress: t("device.operations.progress.signing", {
            method: event.method,
          }),
        });
        return;
      }
      if (
        (event.outcome === "accepted" || event.outcome === "failed") &&
        !finishedCalls.has(event.id)
      ) {
        finishedCalls.add(event.id);
        callsCompleted += 1;
        updateRunningCell({
          callsCompleted,
          progress: t("device.operations.progress.completed", {
            completed: String(callsCompleted),
            started: String(callsStarted),
            method: event.method,
          }),
        });
      }
    });
    const elapsedTimer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1_000);
      const waiting = Date.now() - lastCallAt >= 8_000;
      updateRunningCell({
        elapsedSeconds,
        ...(waiting
          ? { progress: t("device.operations.progress.waiting") }
          : {}),
      });
    }, 1_000);
    try {
      const result = await executeMobileScript(cell.source);
      setOperationCellRuns((previous) => ({
        ...previous,
        [cell.id]: {
          status: "done",
          output:
            result === undefined
              ? t("device.operations.noReturn")
              : formatOperationResult(result),
        },
      }));
      return true;
    } catch (error) {
      setOperationCellRuns((previous) => ({
        ...previous,
        [cell.id]: { status: "error", output: reasonOf(error) },
      }));
      return false;
    } finally {
      window.clearInterval(elapsedTimer);
      unsubscribe();
      setRunningCellId(null);
    }
  };

  const runMobileOperation = async (cell: OperationCell): Promise<void> => {
    if (!instance || runningCellId !== null || cell.source.trim() === "") return;
    await executeOperationCell(cell);
  };

  const argumentSeed = (
    entry: Entry,
    methodName: string,
    variantName?: string,
  ): string => {
    const selectedVariant = entry.variants?.find(
      (variant) => variant.name === variantName,
    ) ?? entry.variants?.[0];
    if (selectedVariant !== undefined) {
      if (selectedVariant.inputs.length === 0) {
        return JSON.stringify(selectedVariant.name);
      }
      const values = selectedVariant.inputs.map((kind, index) =>
        argumentSeed(
          {
            name: kind.toLocaleLowerCase() === "address" ? "player" : `value${index + 1}`,
            kind,
          },
          methodName,
        ),
      );
      return `{ ${selectedVariant.name}: ${values.length === 1 ? values[0] : `[${values.join(", ")}]`} }`;
    }

    const normalized = entry.kind.toLocaleLowerCase();
    if (normalized === "string") return '""';
    if (normalized === "bool") return "false";
    if (levelId === 3 && methodName === "transfer_item" && entry.name === "owner") {
      return "await window.contract.owner_of({ item_id: 17 })";
    }
    if (levelId === 1 && methodName === "open" && entry.name === "owner") {
      return "await window.contract.owner_of({ door_id: 17 })";
    }
    if (levelId === 5 && methodName === "claim_identity" && entry.name === "current_controller") {
      return "await window.contract.controller({ identity: await window.contract.operator_identity() })";
    }
    if (normalized === "address") {
      return /decoder|auxiliary/i.test(entry.name)
        ? "window.aux"
        : "window.player";
    }
    if (/^[ui](8|16|32|64|128|256)$/.test(normalized)) {
      if (levelId === 1 && entry.name === "door_id") return "17";
      if (levelId === 3 && entry.name === "item_id") return "17";
      if (levelId === 4 && entry.name === "floor_id") return "24";
      if (levelId === 5 && entry.name === "identity") {
        return "await window.contract.operator_identity()";
      }
      if (levelId === 10 && entry.name === "op_id" && methodName === "execute") {
        return "1";
      }
      return "0";
    }
    if (levelId === 9 && methodName === "predict" && entry.name === "targets") {
      return "await (async () => { const current = await window.contract.current_sequence(); const count = await window.contract.required_hits(); return Array.from({ length: count }, (_, index) => current + 100 + index); })()";
    }
    if (levelId === 9 && methodName === "predict" && entry.name === "choices") {
      return "Array.from({ length: await window.contract.required_hits() }, () => 0)";
    }
    if (normalized.startsWith("vec<")) return "[]";
    if (normalized.startsWith("bytesn<")) {
      const size = Number.parseInt(
        normalized.match(/bytesn<(\d+)>/)?.[1] ?? "0",
        10,
      );
      return size > 0 ? `new Uint8Array(${size})` : '"0x"';
    }
    if (normalized === "bytes") return "new Uint8Array(0)";
    return "null";
  };

  const notebook = () => {
    const matchingMethods = contractSpec;
    const insertToken = (token: string, cursorOffset = token.length): void =>
      insertOperationText(token, cursorOffset);
    return (
      <>
        <section
          className="device__notebook"
          aria-label={t("device.operations.notebook")}
        >
          {operationCells.map((cell, index) => {
            const run = operationCellRuns[cell.id];
            const isRunning = runningCellId === cell.id;
            return (
              <article
                className={`device__notebook-cell${activeCellId === cell.id ? " is-active" : ""}`}
                key={cell.id}
              >
                <header className="device__notebook-cell-head">
                  <span>
                    {t("device.operations.cell", { number: String(index + 1) })}
                  </span>
                  <div>
                    <button
                      type="button"
                      className="device__cell-run"
                      disabled={
                        !instance ||
                        runningCellId !== null ||
                        cell.source.trim() === ""
                      }
                      onClick={() => void runMobileOperation(cell)}
                      aria-busy={isRunning}
                    >
                      {isRunning ? (
                        t("device.operations.runningShort")
                      ) : (
                        <>
                          <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M5 3.5v9l7-4.5z" />
                          </svg>
                          {t("device.operations.runShort")}
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="device__cell-action"
                      aria-label={t("device.operations.clearCell")}
                      title={t("device.operations.clearCell")}
                      disabled={isRunning}
                      onClick={() => clearOperationCell(cell.id)}
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M7.5 16.5 3.5 12.5a1.4 1.4 0 0 1 0-2l6-6a1.4 1.4 0 0 1 2 0l4 4a1.4 1.4 0 0 1 0 2l-5 6H7.5ZM13 5l4 4M7 16.5h9" />
                      </svg>
                    </button>
                    {operationCells.length > 1 && (
                      <button
                        type="button"
                        className="device__cell-action"
                        aria-label={t("device.operations.deleteCell")}
                        title={t("device.operations.deleteCell")}
                        disabled={isRunning}
                        onClick={() => deleteOperationCell(cell.id)}
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true">
                          <path d="M4 5h12M8 5V3h4v2m3 0-.7 11H5.7L5 5" />
                        </svg>
                      </button>
                    )}
                  </div>
                </header>
                <textarea
                  ref={(element) => {
                    operationEditors.current[cell.id] = element;
                  }}
                  value={cell.source}
                  onFocus={(event) => {
                    setActiveCellId(cell.id);
                    const editor = event.currentTarget;
                    requestAnimationFrame(() => revealEditor(editor));
                  }}
                  onChange={(event) =>
                    updateOperationSource(cell.id, event.target.value)
                  }
                  placeholder={t("device.operations.placeholderShort")}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={t("device.operations.cell", {
                    number: String(index + 1),
                  })}
                />
                {run !== undefined && (
                  <div
                    className={`device__cell-output device__cell-output--${run.status}`}
                    role={
                      run.status === "error"
                        ? "alert"
                        : run.status === "done"
                          ? "status"
                          : undefined
                    }
                  >
                    <span className="device__cell-output-label">
                      {run.status === "error"
                        ? t("device.operations.failedShort")
                        : run.status === "running"
                          ? t("device.operations.runningShort")
                          : t("device.operations.output")}
                    </span>
                    {run.status === "running" && (
                      <>
                        <p className="device__cell-progress" role="status">
                          {run.progress ?? t("device.operations.progress.starting")}
                        </p>
                        <small className="device__cell-elapsed" aria-live="off">
                          {t("device.operations.progress.elapsed", {
                            elapsed: run.elapsedSeconds && run.elapsedSeconds >= 60
                              ? `${Math.floor(run.elapsedSeconds / 60)}:${String(run.elapsedSeconds % 60).padStart(2, "0")}`
                              : `${run.elapsedSeconds ?? 0}s`,
                            completed: String(run.callsCompleted ?? 0),
                            started: String(run.callsStarted ?? 0),
                          })}
                        </small>
                        <small className="device__cell-running-note">
                          {t("device.operations.progress.canClose")}
                        </small>
                      </>
                    )}
                    {run.output !== null && <pre>{run.output}</pre>}
                  </div>
                )}
              </article>
            );
          })}
          <div className="device__notebook-actions">
            <button
              type="button"
              className="device__add-cell"
              onClick={addOperationCell}
            >
              <span aria-hidden="true">＋</span>
              {t("device.operations.addCell")}
            </button>
            <span>{t("device.operations.saved")}</span>
          </div>
          <div
            className="device__code-tools"
            aria-label={t("device.operations.insertToken")}
          >
            {(
              [
                ["await", "await ", 6],
                ["contract", "window.contract.", 16],
                ["parentheses", "()", 1],
                ["braces", "{}", 1],
                ["brackets", "[]", 1],
                ["quotes", '""', 1],
                ["return", "return ", 7],
              ] as const
            ).map(([label, token, offset]) => (
              <button
                type="button"
                key={label}
                onClick={() => insertToken(token, offset)}
              >
                {t(`device.operations.token.${label}`)}
              </button>
            ))}
          </div>
        </section>
        {!instance && (
          <p className="device__operation-notice" role="status">
            {t("device.operations.noInstanceShort")}
          </p>
        )}

        <details className="device__operation-tools">
          <summary>
            <span>{t("device.operations.methods")}</span>
            <span>{contractSpec.length}</span>
          </summary>
          {contractSpec.length === 0 ? (
            <p>{t("device.operations.noMethodsShort")}</p>
          ) : (
            <>
              <p className="device__method-hint">
                {t("device.operations.methodHint")}
              </p>
              <div className="device__method-list">
                {matchingMethods.map((descriptor) => {
                    const variantFor = (entry: Entry): string | undefined => {
                      const key = `${descriptor.name}.${entry.name}`;
                      return methodVariantSelections[key] ?? entry.variants?.[0]?.name;
                    };
                    const args = descriptor.entries
                      .map((entry) =>
                        `${entry.name}: ${argumentSeed(entry, descriptor.name, variantFor(entry))}`,
                      )
                      .join(", ");
                    const call = `return await window.contract.${descriptor.name}(${descriptor.entries.length > 0 ? `{ ${args} }` : ""});`;
                    const firstEntry = descriptor.entries[0];
                    const firstSeed = firstEntry
                      ? argumentSeed(firstEntry, descriptor.name, variantFor(firstEntry))
                      : null;
                    const cursorOffset = firstSeed === null
                      ? call.length
                      : call.indexOf(firstSeed) + (firstSeed === '""' ? 1 : 0);
                    return (
                      <article
                        className="device__method"
                        key={descriptor.name}
                      >
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
                          {descriptor.entries
                            .filter((entry) => (entry.variants?.length ?? 0) > 0)
                            .map((entry) => {
                              const key = `${descriptor.name}.${entry.name}`;
                              const selected = variantFor(entry) ?? "";
                              return (
                                <label className="device__method-variant" key={key}>
                                  <span>{entry.name}</span>
                                  <select
                                    value={selected}
                                    onChange={(event) =>
                                      setMethodVariantSelections((previous) => ({
                                        ...previous,
                                        [key]: event.target.value,
                                      }))
                                    }
                                  >
                                    {entry.variants?.map((variant) => (
                                      <option key={variant.name} value={variant.name}>
                                        {variant.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              );
                            })}
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
                          onClick={() => insertOperationCell(call, cursorOffset)}
                        >
                          {t("device.operations.insertMethod")}
                        </button>
                      </article>
                    );
                })}
              </div>
            </>
          )}
        </details>

      </>
    );
  };

  const operations = () => {
    if (
      level !== null &&
      instance === undefined &&
      onCreateInstance !== undefined
    ) {
      return (
        <div className="device__operation-start">
          <span className="device__operation-start-eyebrow">
            {choose(level.name, language)?.text}
          </span>
          <p className="device__operation-start-note">
            {t("device.operations.startNote")}
          </p>
          <button
            type="button"
            className="button device__operation-start-action"
            onClick={onCreateInstance}
            disabled={creatingInstance}
            aria-busy={creatingInstance}
          >
            {creatingInstance
              ? t("device.operations.starting")
              : t("device.operations.start")}
          </button>
        </div>
      );
    }
    return <BreachRoom notebook={notebook()} />;
  };

  const viewLabel = (target: View): string =>
    target === "home"
      ? t("device.home")
      : APPS.some((item) => item.id === target)
        ? t(APPS.find((item) => item.id === target)?.labelKey ?? "device.home")
        : t(SYSTEM_LABELS[target as SystemScreen]);
  const navigateOS = (target: View): void => {
    setNotificationsOpen(false);
    setQuery("");
    setSystemMessage("");
    setView(target);
  };
  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>): void => {
    if (screenLocked) {
      touchStartY.current = null;
      touchStartScrollTop.current = 0;
      return;
    }
    touchStartY.current = event.touches[0]?.clientY ?? null;
    touchStartScrollTop.current =
      scrollContainerFor(event.target)?.scrollTop ?? 0;
  };
  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>): void => {
    const start = touchStartY.current;
    touchStartY.current = null;
    if (start === null || screenLocked) return;
    const delta = (event.changedTouches[0]?.clientY ?? start) - start;
    const scrollDelta =
      (scrollContainerFor(event.target)?.scrollTop ?? 0) -
      touchStartScrollTop.current;
    const destination = swipeDestination({ delta, view, scrollDelta });
    if (destination !== null) navigateOS(destination);
  };
  const clearNotifications = (): void => {
    setSeen({
      ...counts,
      investigation: level === null ? 0 : 1,
      story: solved ? 1 : 0,
      contacts: Object.fromEntries(
        [...conversations].map(([contact, indices]) => [
          contact,
          indices.length,
        ]),
      ),
    });
  };
  const systemRow = (icon: SystemSymbol, label: string, action: () => void) => (
    <button
      type="button"
      className="device__system-row"
      key={label}
      onClick={action}
    >
      <SystemIcon id={icon} />
      <span>{label}</span>
      <SystemIcon id="next" />
    </button>
  );
  const appTiles = (entries: typeof APPS) => (
    <div className="device__grid">
      {entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={`device__tile${locked(entry.id) ? " device__tile--locked" : ""}`}
          onClick={() => navigateOS(entry.id)}
          aria-label={t(entry.labelKey)}
        >
          <span className={`device__glyph device__glyph--${entry.accent}`}>
            <DeviceIcon id={entry.id} />
          </span>
          <span className="device__label">{t(entry.labelKey)}</span>
          {unread(entry.id) > 0 && (
            <span className="device__badge">{unread(entry.id)}</span>
          )}
        </button>
      ))}
    </div>
  );
  const utilityTiles = (
    <div className="device__grid">
      {UTILITIES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className="device__tile"
          onClick={() => navigateOS(entry.id)}
        >
          <span className="device__glyph device__glyph--cyan">
            <SystemIcon id={entry.icon} />
          </span>
          <span className="device__label">{t(SYSTEM_LABELS[entry.id])}</span>
        </button>
      ))}
    </div>
  );
  const searchBox = (
    <label className="device__search-box">
      <SystemIcon id="search" />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("device.searchPlaceholder")}
        aria-label={t("device.search")}
      />
    </label>
  );
  const availableApps =
    level !== null ? APPS : APPS.filter((item) => item.id !== "operations");
  const searchResults = () => {
    const needle = query.trim().toLocaleLowerCase(language);
    const apps = [
      ...availableApps.map((item) => ({
        id: item.id as View,
        label: t(item.labelKey),
      })),
      ...UTILITIES.map((item) => ({
        id: item.id as View,
        label: t(SYSTEM_LABELS[item.id]),
      })),
    ].filter((item) => item.label.toLocaleLowerCase(language).includes(needle));
    const cases =
      needle.length === 0
        ? []
        : LEVELS.filter((item) =>
            (choose(item.name, language)?.text ?? "")
              .toLocaleLowerCase(language)
              .includes(needle),
          );
    const evidenceItems =
      needle.length === 0
        ? []
        : (narrative?.evidence ?? []).filter(
            (item) =>
              caseState.revealed.has(item.id) &&
              `${pick(item.label)} ${pick(item.value)}`
                .toLocaleLowerCase(language)
                .includes(needle),
          );
    return (
      <div className="device__stack">
        {searchBox}
        <h3 className="device__group-label">{t("device.apps")}</h3>
        {apps.map((item) =>
          systemRow("apps", item.label, () => navigateOS(item.id)),
        )}
        {cases.map((item) => (
          <Link
            className="device__system-row"
            to={`/level/${item.id}`}
            key={item.id}
            onClick={onToggle}
          >
            <SystemIcon id="files" />
            <span>{choose(item.name, language)?.text}</span>
            <SystemIcon id="next" />
          </Link>
        ))}
        {evidenceItems.map((item) =>
          systemRow("files", pick(item.label), () => navigateOS("investigation")),
        )}
        {apps.length + cases.length + evidenceItems.length === 0 && (
          <p className="device__empty">{t("device.noResults")}</p>
        )}
      </div>
    );
  };
  const settingsTitle = t(
    {
      main: "device.settings",
      appearance: "device.appearance",
      notifications: "device.notifications",
      privacy: "device.privacy",
      network: "device.networkScene",
      storage: "device.storage",
      about: "device.about",
    }[settingSection],
  );
  const backDestination =
    view === "settings" && settingSection !== "main"
      ? t("device.settings")
      : view === "comms" && chatThreadOpen
        ? t("device.chat.conversations")
        : t("device.home");
  const goBack = (): void => {
    bodyRef.current?.scrollTo(0, 0);
    if (view === "settings" && settingSection !== "main") {
      setSettingSection("main");
      setSystemMessage("");
    } else if (view === "comms" && chatThreadOpen) setChatThreadOpen(false);
    else navigateOS("home");
  };
  const settings = () => (
    <div className={`device__settings device__settings--${settingSection}`}>
      {settingSection === "main" ? (
        <div className="device__settings-list">
          {systemRow("brightness", t("device.appearance"), () =>
            setSettingSection("appearance"),
          )}
          {systemRow("settings", t("device.controls"), () =>
            navigateOS("controls"),
          )}
          {systemRow("notifications", t("device.notifications"), () =>
            setSettingSection("notifications"),
          )}
          {systemRow("shield", t("device.privacy"), () =>
            setSettingSection("privacy"),
          )}
          {systemRow("browser", t("device.networkScene"), () =>
            setSettingSection("network"),
          )}
          {systemRow("storage", t("device.storage"), () =>
            setSettingSection("storage"),
          )}
          {systemRow("language", t("device.help.language"), () =>
            toggleLanguage(nextLanguage(language)),
          )}
          {systemRow("shield", t("device.about"), () =>
            setSettingSection("about"),
          )}
        </div>
      ) : settingSection === "appearance" ? (
        <>
          <label className="device__setting">
            <span>{t("device.wallpaper")}</span>
            <input
              type="checkbox"
              role="switch"
              checked={wallpaper}
              onChange={(event) => setWallpaper(event.target.checked)}
            />
          </label>
          <label className="device__setting">
            <span>{t("device.color")}</span>
            <select
              value={accent}
              onChange={(event) =>
                setAccent(event.target.value === "cyan" ? "cyan" : "green")
              }
            >
              <option value="green">{t("device.green")}</option>
              <option value="cyan">{t("device.cyan")}</option>
            </select>
          </label>
          <label className="device__setting device__setting--range">
            <span>
              {t("device.brightness")}
              <output>{brightness}%</output>
            </span>
            <input
              type="range"
              min="35"
              max="100"
              value={brightness}
              onChange={(event) => setBrightness(Number(event.target.value))}
            />
          </label>
        </>
      ) : settingSection === "notifications" ? (
        <>
          <label className="device__setting">
            <span>{t("device.showPreviews")}</span>
            <input
              type="checkbox"
              role="switch"
              checked={previews}
              onChange={(event) => setPreviews(event.target.checked)}
            />
          </label>
          <button
            className="device__settings-action"
            type="button"
            onClick={() => {
              clearNotifications();
              setSystemMessage(t("device.cleared"));
            }}
          >
            <SystemIcon id="notifications" />
            {t("device.clearNotifications")}
          </button>
        </>
      ) : settingSection === "privacy" ? (
        <>
          <div className="device__settings-status">
            <span>{t("device.privacy.status")}</span>
            <strong>{t("device.status.active")}</strong>
          </div>
          <button
            className="device__settings-action"
            type="button"
            onClick={() => {
              setScreenLocked(true);
              setScanPhase("idle");
              setUnlockTarget("home");
            }}
          >
            <SystemIcon id="lock" />
            {t("device.lockPhone")}
          </button>
        </>
      ) : settingSection === "network" ? (
        <>
          <dl className="device__settings-details">
            <div>
              <dt>{t("device.network")}</dt>
              <dd>Stellar Testnet</dd>
            </div>
            <div>
              <dt>{t("device.player")}</dt>
              <dd>{short(player)}</dd>
            </div>
            <div>
              <dt>{t("device.today")}</dt>
              <dd>
                {level === null ? "—" : choose(level.name, language)?.text}
              </dd>
            </div>
          </dl>
        </>
      ) : settingSection === "storage" ? (
        <>
          <div className="device__settings-status">
            <span>{t("device.storage.local")}</span>
            <strong>{t("device.status.ready")}</strong>
          </div>
          <button
            type="button"
            className="device__settings-action device__settings-action--clear"
            onClick={() => {
              caseState.clear();
              setChat([]);
              setSeen({ ...SEEN_EMPTY });
              setSystemMessage(t("device.cleared"));
            }}
          >
            <SystemIcon id="storage" />
            {t("device.help.clear")}
          </button>
        </>
      ) : (
        <div className="device__settings-about">
          <DeviceBrand />
          <div className="device__settings-official">
            <span>{t("device.about.issuer")}</span>
            <strong>{t("device.about.official")}</strong>
            <p>{t("device.about.terminal")}</p>
            <small>{t("device.about.build")}</small>
          </div>
        </div>
      )}
      {systemMessage && (
        <p role="status" className="device__settings-feedback">
          {systemMessage}
        </p>
      )}
    </div>
  );
  const controls = () => (
    <div className="device__stack">
      <div className="device__control-grid">
        {(["wifi", "bluetooth", "focus", "operator"] as const).map((id) => (
          <button
            type="button"
            key={id}
            className={`device__control${(id === "wifi" && sceneToggles.wifi) || (id === "bluetooth" && sceneToggles.bluetooth) || (id === "focus" && operatingMode !== "normal") ? " is-on" : ""}`}
            aria-label={t(`device.${id}`)}
            aria-pressed={
              id === "wifi"
                ? sceneToggles.wifi
                : id === "bluetooth"
                  ? sceneToggles.bluetooth
                  : id === "focus"
                    ? operatingMode !== "normal"
                    : undefined
            }
            onClick={() => {
              if (id === "operator") navigateOS("operator");
              else if (id === "focus")
                setOperatingMode((mode) =>
                  mode === "normal" ? "focus" : "normal",
                );
              else setSceneToggles((value) => ({ ...value, [id]: !value[id] }));
            }}
          >
            <SystemIcon id={id} />
          </button>
        ))}
      </div>
      <label className="device__brightness">
        <SystemIcon id="brightness" />
        <input
          type="range"
          min="35"
          max="100"
          value={brightness}
          onChange={(event) => setBrightness(Number(event.target.value))}
          aria-label={t("device.brightness")}
        />
      </label>
      <h3 className="device__group-label">{t("device.operatingMode")}</h3>
      <div className="device__segments">
        {(["normal", "focus", "quiet"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={operatingMode === mode}
            onClick={() => setOperatingMode(mode)}
          >
            {t(`device.mode.${mode}`)}
          </button>
        ))}
      </div>
      <div className="device__control-grid">
        {(["capture", "airplane", "flashlight"] as const).map((id) => (
          <button
            type="button"
            key={id}
            className={`device__control${(id === "flashlight" && flashlight) || (id === "airplane" && sceneToggles.airplane) ? " is-on" : ""}`}
            aria-label={t(`device.${id}`)}
            onClick={() => {
              if (id === "flashlight") setFlashlight((value) => !value);
              else if (id === "airplane")
                setSceneToggles((value) => ({ ...value, [id]: !value[id] }));
              else {
                const link = document.createElement("a");
                link.href =
                  level === null
                    ? "/images/login/meridian.webp"
                    : levelImage(level.id);
                link.download = `breaker-${levelId}${link.href.endsWith(".png") ? ".png" : ".webp"}`;
                link.click();
              }
            }}
          >
            <SystemIcon id={id} />
            <span>{t(`device.${id}`)}</span>
          </button>
        ))}
      </div>
      <p className="device__note">{t("device.sceneControlsNote")}</p>
    </div>
  );
  const fieldMap = () => {
    const active = level === null ? undefined : FIELD_CONTEXT[level.id];
    const sites = Object.entries(FIELD_CONTEXT)
      .filter(([id]) => Number(id) % 2 === 0)
      .slice(0, 7);
    return (
      <section className="device__field-map" aria-label={t("device.map")}>
        <header>
          <span>{t("device.map.kicker")}</span>
          <h3>{t("device.map")}</h3>
          <p>{t("device.map.body")}</p>
        </header>
        <div
          className="device__map-grid"
          aria-label={t("device.map.locations")}
        >
          {sites.map(([id, site]) => (
            <div className={active === site ? "is-active" : ""} key={id}>
              <i aria-hidden="true" />
              <strong>{pick(site.district)}</strong>
              <small>{`CASE ${levelCode(Number(id))}`}</small>
            </div>
          ))}
        </div>
        {active && (
          <p className="device__map-active">
            <span aria-hidden="true" />
            {t("device.map.active", { district: pick(active.district) })}
          </p>
        )}
        <p className="device__note">{t("device.map.note")}</p>
      </section>
    );
  };

  const body = (() => {
    switch (view) {
      case "launcher":
        return query.trim() ? (
          searchResults()
        ) : (
          <div className="device__stack">
            {searchBox}
            <h3 className="device__group-label">{t("device.primary")}</h3>
            {appTiles(availableApps.slice(0, 4))}
            <h3 className="device__group-label">{t("device.system")}</h3>
            {appTiles(availableApps.slice(4))}
            <h3 className="device__group-label">{t("device.utilities")}</h3>
            {utilityTiles}
          </div>
        );
      case "search":
        return searchResults();
      case "controls":
        return controls();
      case "operator":
        return <DeviceIdentity />;
      case "settings":
        return settings();
      case "notes":
        return <DeviceNotes key={player ?? "anon"} player={player} />;
      case "files":
        return documents();
      case "browser":
        return <DeviceBrowser />;
      case "scanner":
        return (
          <DeviceScanner
            context={level === null ? undefined : FIELD_CONTEXT[level.id]}
            onOpenInvestigation={() => navigateOS("investigation")}
          />
        );
      case "map":
        return fieldMap();
      case "quick":
        return (
          <div className="device__stack">
            <div className="device__quick-grid">
              {(["investigation", "scanner", "wallet", "terminal"] as const).map(
                (id) => (
                  <button
                    type="button"
                    className="device__quick-action"
                    key={id}
                    onClick={() => navigateOS(id)}
                  >
                    {id === "investigation" || id === "wallet" || id === "terminal" ? (
                      <DeviceIcon id={id} />
                    ) : (
                      <SystemIcon id={id === "scanner" ? "qr" : "notes"} />
                    )}
                    <span>
                      {t(
                        id === "investigation"
                          ? "device.app.cases"
                          : id === "wallet" || id === "terminal"
                            ? `device.app.${id}`
                          : SYSTEM_LABELS[id],
                      )}
                    </span>
                  </button>
                ),
              )}
            </div>
            {systemRow("brightness", t("device.appearance"), () => {
              setSettingSection("appearance");
              navigateOS("settings");
            })}
            {systemRow("notifications", t("device.notifications"), () =>
              setNotificationsOpen(true),
            )}
            {systemRow("shield", t("device.privacy"), () => {
              setSettingSection("privacy");
              navigateOS("settings");
            })}
            {systemRow("browser", t("device.networkScene"), () => {
              setSettingSection("network");
              navigateOS("settings");
            })}
            {systemRow("storage", t("device.storage"), () => {
              setSettingSection("storage");
              navigateOS("settings");
            })}
            {systemRow("language", t("device.help.language"), () =>
              toggleLanguage(nextLanguage(language)),
            )}
          </div>
        );
      case "wallet":
        return <DeviceWallet onClose={onToggle} />;
      case "collection":
        return <DeviceCollection player={player} onClose={onToggle} />;
      case "cases":
        return <BreakerNotes />;
      case "investigation": {
        if (level === null) {
          return (
            <div className="device__stack">
              <DeviceNotes key={player ?? "anon"} player={player} />
              <BreakerNotes />
            </div>
          );
        }
        const field = FIELD_CONTEXT[level.id];
        const latestEvidence = narrative?.evidence
          .filter((item) => caseState.revealed.has(item.id))
          .at(-1);
        const latestCall = caseState.calls.at(-1);
        const systemSignals = caseState.fired.flatMap((index) => {
          const beat = narrative?.beats[index];
          return beat?.speaker === "system"
            ? [{ id: `signal-${index}`, text: fill(pick(beat.text)) }]
            : [];
        });
        const evidenceItems =
          narrative?.evidence.filter((item) =>
            caseState.revealed.has(item.id),
          ) ?? [];
        return (
          <div className="device__stack">
            {field && (
              <div className="device__stack">
                <span className="device__group-label">
                  {pick(field.district)}
                </span>
                <p className="device__note">{pick(field.dispatch)}</p>
                <p className="device__note">{pick(field.scan)}</p>
              </div>
            )}
            <section
              className="device__case-status"
              aria-label={t("device.caseStatus")}
            >
              <h3>{t("device.caseStatus")}</h3>
              <ul>
                <li className="is-current">
                  <span>{t("device.caseStatus.dossier")}</span>
                  <strong>{t("device.caseStatus.active")}</strong>
                </li>
                <li>
                  <span>{t("device.caseStatus.evidence")}</span>
                  <strong>
                    {latestEvidence
                      ? fill(pick(latestEvidence.label))
                      : t("device.caseStatus.pending")}
                  </strong>
                </li>
                <li>
                  <span>{t("device.caseStatus.operation")}</span>
                  <strong>
                    {latestCall
                      ? `${latestCall.method} · ${latestCall.outcome === "failed" ? t(`device.terminal.failure.${latestCall.failure ?? "unknown"}`) : t(`device.terminal.outcome.${latestCall.outcome}`)}`
                      : t("device.caseStatus.none")}
                  </strong>
                </li>
              </ul>
            </section>
            {(systemSignals.length > 0 ||
              evidenceItems.length > 0 ||
              caseState.calls.length > 0) && (
              <section
                className="device__activity"
                aria-label={t("device.activity")}
              >
                <h3>{t("device.activity")}</h3>
                {systemSignals.length > 0 && (
                  <div className="device__activity-group">
                    <h4>{t("device.activity.signals")}</h4>
                    <ol>
                      {systemSignals.map((signal) => (
                        <li key={signal.id}>
                          <span>SYS</span>
                          <p>{signal.text}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {evidenceItems.length > 0 && (
                  <div className="device__activity-group">
                    <h4>{t("device.activity.evidence")}</h4>
                    <ol>
                      {evidenceItems.map((item) => (
                        <li key={item.id}>
                          <span>EV</span>
                          <p>{fill(pick(item.label))}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {caseState.calls.length > 0 && (
                  <div className="device__activity-group">
                    <h4>{t("device.activity.operations")}</h4>
                    <ol>
                      {caseState.calls
                        .slice()
                        .reverse()
                        .map((call) => (
                          <li key={call.id}>
                            <span>{call.outcome === "failed" ? "!" : "→"}</span>
                            <p>
                              <strong>{call.method}</strong> ·{" "}
                              {call.outcome === "failed"
                                ? t(
                                    `device.terminal.failure.${call.failure ?? "unknown"}`,
                                  )
                                : t(`device.terminal.outcome.${call.outcome}`)}
                            </p>
                          </li>
                        ))}
                    </ol>
                  </div>
                )}
              </section>
            )}
            <CaseFileBody
              level={level}
              caseFile={caseFile}
              narrative={narrative}
              player={player}
              instance={instance}
              solved={solved}
              state={caseState}
              onClose={onToggle}
            />
            <DeviceNotes key={player ?? "anon"} player={player} />
            <BreakerNotes />
          </div>
        );
      }
      case "comms":
        return comms();
      case "evidence":
        return evidence();
      case "operations":
        return level !== null ? operations() : null;
      case "terminal":
        return terminal();
      case "story":
        return story();
      case "news":
        return <DeviceNews levelId={level?.id ?? 0} />;
      case "help":
        return help();
      case "home":
        return null;
    }
  })();

  const home = (
    <div className="device__home">
      <div className="device__dashboard-header">
        <button
          className="device__avatar"
          type="button"
          onClick={() => navigateOS("operator")}
          aria-label={t("device.operator")}
        >
          <SystemIcon id="operator" />
          <i />
        </button>
      </div>
      <button
        type="button"
        className="device__mission"
        onClick={() => navigateOS("investigation")}
      >
        <span className="device__mission-meta">
          {level === null
            ? t("device.mission.today")
            : `SEQUENCE 01 / CASE ${levelCode(level.id)}`}
        </span>
        <strong>
          {level === null
            ? t("device.chooseCase")
            : choose(level.name, language)?.text}
        </strong>

        <span className="device__mission-state">
          {level === null
            ? t("device.noActiveCase")
            : t(solved ? "collection.solved" : "device.investigation")}
        </span>
        {level !== null && (
          <span className="device__mission-meter">
            <i style={{ width: solved ? "100%" : "0%" }} />
          </span>
        )}
        <span className="device__mission-cta">
          {t(level === null ? "device.chooseCaseCta" : "device.continueInvestigation")}
          <SystemIcon id="next" />
        </span>
      </button>
      {appTiles(availableApps)}
    </div>
  );

  const openNotification = (target: View): void => {
    if (target === "comms") {
      const latestIndex = caseState.fired.at(-1);
      setChatContact(
        [...conversations].find(
          ([, indices]) =>
            latestIndex !== undefined && indices.includes(latestIndex),
        )?.[0] ?? "mara",
      );
    }
    if (screenLocked) {
      setUnlockTarget(target);
      fingerprintRef.current?.focus();
      return;
    }
    setNotificationsOpen(false);
    setView(target);
    if (target === "comms") setChatThreadOpen(true);
  };
  const latestBeat = narrative?.beats[caseState.fired.at(-1) ?? -1];
  const latestEvidence = narrative?.evidence
    .filter((item) => caseState.revealed.has(item.id))
    .at(-1);
  const latestCall = caseState.calls.at(-1);
  const noticeItems: {
    id: string;
    app: OsAppId;
    group: "comms" | "system" | "cases";
    title: string;
    text: string;
    count: number;
  }[] = [];
  if (level === null && unread("comms") > 0)
    noticeItems.push({
      id: "welcome",
      app: "comms",
      group: "comms",
      title: "MARA VALE",
      text: t("device.chat.homeWelcome"),
      count: 1,
    });
  if (unread("comms") > 0 && latestBeat)
    noticeItems.push({
      id: "comms",
      app: "comms",
      group: "comms",
      title: SPEAKER[latestBeat.speaker],
      text: fill(pick(latestBeat.text)),
      count: unread("comms"),
    });
  if (level !== null && dossierUnread > 0)
    noticeItems.push({
      id: "case",
      app: "investigation",
      group: "cases",
      title: choose(level.name, language)?.text ?? "",
      text: t("device.caseReceived"),
      count: dossierUnread,
    });
  if (unread("evidence") > 0 && latestEvidence)
    noticeItems.push({
      id: "evidence",
      app: "investigation",
      group: "cases",
      title: fill(pick(latestEvidence.label)),
      text: t("device.notification.evidence"),
      count: unread("evidence"),
    });
  if (unread("terminal") > 0 && latestCall)
    noticeItems.push({
      id: "terminal",
      app: "terminal",
      group: "system",
      title: latestCall.method,
      text:
        latestCall.outcome === "failed"
          ? t("device.notification.callFailed")
          : t("device.notification.callAccepted"),
      count: unread("terminal"),
    });
  if (storyUnread > 0)
    noticeItems.push({
      id: "story",
      app: "investigation",
      group: "cases",
      title: t("device.app.story"),
      text: t("device.notification.story"),
      count: storyUnread,
    });
  const displayedNotices = screenLocked
    ? noticeItems.slice(0, 1)
    : noticeItems.filter(
        (item) =>
          notificationFilter === "all" || item.group === notificationFilter,
      );
  const notifications = (
    <div className="device__notifications">
      {!screenLocked && (
        <>
          <div className="device__notification-heading">
            <h2>{t("device.notifications")}</h2>
            <button type="button" onClick={clearNotifications}>
              {t("device.clearAll")}
            </button>
          </div>
          <div className="device__segments">
            {(["all", "comms", "system", "cases"] as const).map((filter) => (
              <button
                type="button"
                key={filter}
                aria-pressed={notificationFilter === filter}
                onClick={() => setNotificationFilter(filter)}
              >
                {t(`device.filter.${filter}`)}
              </button>
            ))}
          </div>
        </>
      )}
      {displayedNotices.map((item) => (
        <button
          type="button"
          key={item.id}
          className="device__notification"
          onClick={() => openNotification(item.app)}
        >
          <span className="device__notification-icon">
            <DeviceIcon id={item.app} />
          </span>
          <span>
            <strong>{item.title}</strong>
            <span>
              {previews && operatingMode !== "quiet"
                ? item.text
                : t("device.updatesAvailable")}
            </span>
          </span>
          <small>{screenLocked ? t("device.now") : item.count}</small>
        </button>
      ))}
      {displayedNotices.length === 0 && !screenLocked && (
        <p className="device__notification-empty">
          {t("device.noNotifications")}
        </p>
      )}
    </div>
  );

  return (
    <aside
      ref={deviceRef}
      className="os os--device"
      id="breaker-os"
      aria-label="Breaker OS"
    >
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={
          {
            "--os-accent": accent === "green" ? "#00e6ad" : "#58d9f4",
          } as CSSProperties
        }
        className={`device device--panel${wallpaper ? " device--wallpaper" : ""}${flashlight ? " device--flashlight" : ""}${operatingMode !== "normal" ? " device--calm" : ""}${screenLocked ? " device--locked" : ""}${scanPhase !== "idle" ? ` device--scan-${scanPhase}` : ""}`}
      >
        <header
          className="device__status"
          style={{ opacity: brightness / 100 }}
        >
          <span className="device__time">{time}</span>
          <span className="device__hardware-brand" aria-hidden="true">
            BREAKER <b>OS</b>
          </span>
          <span className="device__status-right">
            <span className="device__signal" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="device__battery" aria-hidden="true">
              <i />
            </span>
            {mobileGameplay && (
              <button
                type="button"
                className="device__close-os"
                onClick={onToggle}
                aria-label={t("device.close")}
                title={t("device.close")}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m5 5 10 10M15 5 5 15" />
                </svg>
              </button>
            )}
          </span>
        </header>

        <div
          className="device__screen"
          style={
            {
              filter: `brightness(${brightness / 100})`,
              "--os-accent": accent === "green" ? "#00e6ad" : "#58d9f4",
            } as CSSProperties
          }
        >
          {screenLocked ? (
            <div className="device__lockscreen">
              <div className="device__lockclock">
                <DigitalClock time={time} />
                <DeviceBrand />
              </div>
              {notifications}
              <div className="device__biometric">
                <button
                  ref={fingerprintRef}
                  type="button"
                  className="device__fingerprint"
                  disabled={scanPhase !== "idle"}
                  aria-label={t("device.unlockFingerprint")}
                  aria-busy={scanPhase === "reading"}
                  onClick={() => setScanPhase("reading")}
                >
                  <svg
                    className="device__fingerprint-ridges"
                    viewBox="0 0 80 80"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    {[
                      "M15 36C15 4 65 4 65 36",
                      "M9 46V37M71 46V37",
                      "M22 43V35C22 11 58 11 58 35V46C58 56 54 65 49 72",
                      "M15 45C15 57 12 61 10 64M65 46C65 57 62 65 59 70",
                      "M29 46V35C29 20 51 20 51 35V46C51 58 47 66 41 73",
                      "M22 50C22 61 18 67 16 69",
                      "M36 44V35C36 29 44 29 44 35V46C44 57 40 65 33 71",
                      "M29 53C28 61 25 66 23 69M36 51C35 58 33 62 30 65",
                    ].map((d, index) => (
                      <g key={d} style={{ "--ridge": index } as CSSProperties}>
                        <path className="device__ridge-base" d={d} />
                        <path
                          className="device__ridge-read"
                          d={d}
                          pathLength="1"
                        />
                      </g>
                    ))}
                  </svg>
                  <span className="device__fingerprint-check">
                    <SystemIcon id="check" />
                  </span>
                </button>
                <span className="device__biometric-status" role="status">
                  {scanPhase === "reading"
                    ? t("device.fingerprintReading")
                    : scanPhase === "accepted"
                      ? t("device.fingerprintAccepted")
                      : ""}
                </span>
              </div>
            </div>
          ) : notificationsOpen ? (
            notifications
          ) : view === "home" ? (
            home
          ) : (
            <div className="device__app">
              <div className="device__appbar">
                <button
                  type="button"
                  className="device__back"
                  ref={appbarBackRef}
                  onClick={goBack}
                  aria-label={`${t("device.back")}: ${backDestination}`}
                  title={backDestination}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M15 5l-7 7 7 7" />
                  </svg>
                  <span>{t("device.back")}</span>
                </button>
                <span className="device__app-title">
                  {view === "settings"
                    ? settingsTitle
                    : view === "comms"
                      ? chatThreadOpen
                        ? SPEAKER[chatContact]
                        : t("device.chat.conversations")
                      : app === undefined
                        ? viewLabel(view)
                        : t(app.labelKey)}
                </span>
                <span className="device__appbar-spacer" aria-hidden="true" />
              </div>
              <div
                className={`device__appbody${view === "comms" ? " device__appbody--chat" : view === "browser" ? " device__appbody--browser" : ""}`}
                ref={bodyRef}
                aria-live={view === "comms" ? "polite" : undefined}
              >
                {body}
              </div>
              {view === "comms" && chatThreadOpen && (
                <div className="device__chat-compose">
                  {availableReplies.length > 0 ? (
                    <div
                      className="device__chat-suggestions"
                      aria-label={t("device.chat.availableReplies")}
                    >
                      {availableReplies.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => sendChat(option.id)}
                        >
                          {fill(pick(option.label))}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p
                      className="device__note device__chat-waiting"
                      role="status"
                    >
                      {t(
                        replies.some(
                          (option) =>
                            option.contact === chatContact &&
                            !chat.some((entry) => entry.optionId === option.id),
                        )
                          ? "device.chat.waitProgress"
                          : "device.chat.exhausted",
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {!screenLocked && view === "home" && (
          <nav
            className="device__phone-controls"
            aria-label={t("device.brand")}
          >
            <button
              type="button"
              className={
                view === "home" && !notificationsOpen ? "is-active" : ""
              }
              onClick={() => navigateOS("home")}
            >
              <SystemIcon id="home" />
              <small>{t("device.home")}</small>
            </button>
            <button type="button" onClick={() => navigateOS("launcher")}>
              <SystemIcon id="apps" />
              <small>{t("device.apps")}</small>
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingSection("main");
                navigateOS("settings");
              }}
            >
              <SystemIcon id="settings" />
              <small>{t("device.mobileSettings")}</small>
            </button>
          </nav>
        )}
      </div>
    </aside>
  );
}

function DeviceNews({ levelId }: { levelId: number }): ReactElement {
  const { t, language } = useLanguage();
  const [article, setArticle] = useState<NarrativeDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadNews(levelId).then((document) => {
      if (alive) {
        setArticle(document);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [levelId]);

  return (
    <div className="device__news">
      <header className="device__news-masthead">
        <div>
          <span className="device__news-kicker">
            {t("device.news.masthead")}
          </span>
          <strong>{t("device.news.title")}</strong>
        </div>
        <span>{t("device.news.edition")}</span>
      </header>
      <nav
        className="device__news-sections"
        aria-label={t("device.news.ariaSections")}
      >
        <span className="is-active">{t("device.news.section.city")}</span>
        <span>{t("device.news.section.authority")}</span>
        <span>{t("device.news.section.underlayer")}</span>
      </nav>
      {loading ? (
        <p role="status" className="device__note">
          {t("device.news.loading")}
        </p>
      ) : article ? (
        <article className="device__news-story">
          <div className="device__news-story-meta">
            <span>{t("device.news.fieldReport")}</span>
            <span>{t("device.news.readTime")}</span>
          </div>
          <h2>{article.title[language]}</h2>
          <p className="device__news-deck">
            {article.body[0]?.[language] ?? ""}
          </p>
          <div className="device__news-rule" />
          <div className="device__news-byline">
            <span>{article.source[language]}</span>
            <button
              type="button"
              onClick={() => setSaved((value) => !value)}
              aria-pressed={saved}
            >
              {saved ? t("device.news.saved") : t("device.news.save")}
            </button>
          </div>
          <div className="device__news-body">
            {article.body.slice(1).map((paragraph, index) => (
              <p key={index}>{paragraph[language]}</p>
            ))}
          </div>
          <footer className="device__news-footer">
            <span>{t("device.news.footer")}</span>
            <span>{t("device.news.end")}</span>
          </footer>
        </article>
      ) : (
        <p role="status" className="device__note">
          {t("device.news.empty")}
        </p>
      )}
    </div>
  );
}

function DeviceWallet({ onClose }: { onClose: () => void }): ReactElement {
  const wallet = useWallet();
  const { t } = useLanguage();
  const { copy } = useCopy();
  const [portfolio, setPortfolio] = useState<WalletPortfolio | null>(null);
  const [history, setHistory] = useState<WalletActivity[]>([]);
  const [tab, setTab] = useState<"balance" | "send">("balance");
  const [assetId, setAssetId] = useState("native");
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [memoType, setMemoType] = useState<"text" | "id">("text");
  const [prepared, setPrepared] = useState<PreparedTransfer | null>(null);
  const [phase, setPhase] = useState<
    | "idle"
    | "loading"
    | "review"
    | "signing"
    | "submitting"
    | "success"
    | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [hash, setHash] = useState("");
  const addressRef = useRef(wallet.address);
  addressRef.current = wallet.address;
  const alive = useRef(true);
  const sending = useRef(false);
  const busy =
    phase === "loading" || phase === "signing" || phase === "submitting";
  const nativeAsset = portfolio?.assets.find((asset) => asset.id === "native");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const address = wallet.address;
    setPortfolio(null);
    setHistory([]);
    setPrepared(null);
    setMessage("");
    setHash("");
    setDestination("");
    setAmount("");
    setMemo("");
    setAssetId("native");
    if (!address || wallet.walletKind === "passkey") {
      setPhase("idle");
      return;
    }
    setPhase("loading");
    let current = true;
    void Promise.allSettled([
      loadWalletPortfolio(address),
      loadWalletHistory(address),
    ]).then(([portfolioResult, historyResult]) => {
      if (!current) return;
      if (portfolioResult.status === "rejected") {
        setPhase("error");
        setMessage(t("device.wallet.loadError"));
        return;
      }
      setPortfolio(portfolioResult.value);
      setHistory(
        historyResult.status === "fulfilled" ? historyResult.value : [],
      );
      setPhase("idle");
    });
    return () => {
      current = false;
    };
  }, [wallet.address, wallet.walletKind, t]);
  const showError = (error: unknown): string =>
    error instanceof TokenTransferError
      ? t(`device.wallet.error.${error.code}`)
      : error instanceof TransferSubmissionError
        ? t("device.wallet.error.submissionUnconfirmed")
        : error instanceof Error && error.name === "AccountRequiresMemoError"
          ? t("device.wallet.error.memoRequired")
          : reasonOf(error);
  const review = (): void => {
    const source = wallet.address;
    if (!source || !wallet.signer || sending.current || hash) return;
    sending.current = true;
    setPhase("loading");
    setMessage("");
    void prepareTokenTransfer({
      source,
      destination: destination.trim(),
      assetId,
      amount,
      ...(memo ? { memo: { type: memoType, value: memo } } : {}),
    })
      .then((value) => {
        if (alive.current && addressRef.current === source) {
          setPrepared(value);
          setPhase("review");
        }
      })
      .catch((error: unknown) => {
        if (alive.current && addressRef.current === source) {
          setMessage(showError(error));
          setPhase("error");
        }
      })
      .finally(() => {
        sending.current = false;
      });
  };
  const confirm = (): void => {
    const source = wallet.address;
    const signer = wallet.signer;
    if (
      !prepared ||
      !source ||
      !signer ||
      sending.current ||
      phase !== "review"
    )
      return;
    sending.current = true;
    setPhase("signing");
    setMessage("");
    const guardedSigner = {
      ...signer,
      signTransaction: async (xdr: string) => {
        const result = await signer.signTransaction(xdr);
        if (alive.current && addressRef.current === source)
          setPhase("submitting");
        return result;
      },
    };
    void signAndSubmitTokenTransfer(
      prepared,
      guardedSigner,
      () => alive.current && addressRef.current === source,
    )
      .then((result) => {
        if (!alive.current || addressRef.current !== source) return;
        setHash(result);
        setPhase("success");
        void Promise.allSettled([
          loadWalletPortfolio(source),
          loadWalletHistory(source),
        ]).then(([portfolioResult, historyResult]) => {
          if (
            alive.current &&
            addressRef.current === source &&
            portfolioResult.status === "fulfilled"
          ) {
            setPortfolio(portfolioResult.value);
            if (historyResult.status === "fulfilled")
              setHistory(historyResult.value);
          }
        });
      })
      .catch((error: unknown) => {
        if (!alive.current || addressRef.current !== source) return;
        if (error instanceof TransferSubmissionError) setHash(error.hash);
        setMessage(showError(error));
        setPhase("error");
      })
      .finally(() => {
        sending.current = false;
      });
  };
  if (!wallet.address)
    return (
      <div className="device__stack">
        <p className="device__note">{t("device.wallet.connect")}</p>
        <button
          type="button"
          className="device__system-row"
          onClick={() => void wallet.connect()}
        >
          <DeviceIcon id="wallet" />
          {t("wallet.connect")}
        </button>
      </div>
    );
  if (wallet.walletKind === "passkey")
    return (
      <div className="device__stack">
        <section className="device__wallet-hero" aria-label={t("wallet.title")}>
          <div className="device__wallet-hero-top">
            <div className="device__network-switch" role="status">
              <span className="device__network-dot" />
              {t("wallet.connected")}
            </div>
            <span className="device__wallet-symbol">⌁</span>
          </div>
          <p className="device__wallet-balance-label">{t("wallet.passkey.account")}</p>
          <button
            type="button"
            className="device__wallet-address"
            onClick={() => void copy(wallet.address ?? "")}
            title={wallet.address}
          >
            <span>{short(wallet.address)}</span>
            <DeviceIcon id="copy" />
          </button>
        </section>
        <p className="device__note">{t("device.wallet.passkeyOnly")}</p>
        <button
          type="button"
          className="device__system-row"
          onClick={() => {
            onClose();
            void wallet.connect();
          }}
        >
          <DeviceIcon id="wallet" />
          {t("device.wallet.connectForTokens")}
        </button>
        <button
          type="button"
          className="device__system-row"
          onClick={() => void wallet.disconnect()}
        >
          <DeviceIcon id="disconnect" />
          {t("wallet.disconnect")}
        </button>
      </div>
    );
  return (
    <div className="device__stack device__token-wallet">
      <section className="device__wallet-hero" aria-label={t("wallet.title")}>
        <div className="device__wallet-hero-top">
          <div
            className="device__network-switch"
            role="group"
            aria-label={t("device.wallet.network")}
          >
            <span className="is-active">TESTNET</span>
            <button
              type="button"
              disabled
              title={t("device.wallet.mainnetSoon")}
            >
              MAINNET
            </button>
          </div>
          <span className="device__wallet-live">
            <i />
            {t("device.wallet.connected")}
          </span>
        </div>
        <div className="device__wallet-balance-label">
          {t("device.wallet.totalBalance")}
        </div>
        <strong className="device__wallet-balance">
          {nativeAsset?.balance ?? "—"} <small>XLM</small>
        </strong>
        <button
          className="device__wallet-address"
          type="button"
          onClick={() => void copy(wallet.address ?? "")}
          title={wallet.address ?? undefined}
        >
          <span>{short(wallet.address)}</span>
          <SystemIcon id="copy" />
        </button>
      </section>
      <div className="device__segments">
        {(["balance", "send"] as const).map((item) => (
          <button
            key={item}
            type="button"
            disabled={busy}
            aria-pressed={tab === item}
            onClick={() => {
              setTab(item);
              setPrepared(null);
              if (phase === "review") setPhase("idle");
            }}
          >
            {t(`device.wallet.${item}`)}
          </button>
        ))}
      </div>
      {tab === "balance" ? (
        <>
          {phase === "loading" && (
            <p className="device__note" role="status">
              {t("device.wallet.loading")}
            </p>
          )}
          {portfolio?.assets.map((asset) => (
            <button
              className="device__token-balance"
              type="button"
              key={asset.id}
              onClick={() => {
                setAssetId(asset.id);
                setTab("send");
              }}
            >
              <span>
                <strong>{asset.code}</strong>
                <small>
                  {asset.issuer
                    ? short(asset.issuer)
                    : t("device.wallet.native")}
                </small>
              </span>
              <span>
                <strong>{asset.balance}</strong>
                <small>
                  {t("device.wallet.available")}: {asset.available}
                </small>
              </span>
            </button>
          ))}
          {portfolio && (
            <p className="device__note">
              {t("device.wallet.reserve")}: {portfolio.reserve} XLM
            </p>
          )}
          <section
            className="device__wallet-activity"
            aria-labelledby="wallet-activity-title"
          >
            <div className="device__wallet-section-heading">
              <h3 id="wallet-activity-title">{t("device.wallet.activity")}</h3>
              <a
                href={`https://stellar.expert/explorer/testnet/account/${wallet.address}`}
                target="_blank"
                rel="noreferrer"
              >
                {t("device.wallet.seeAll")}
              </a>
            </div>
            {history.length === 0 ? (
              <p className="device__note">{t("device.wallet.noActivity")}</p>
            ) : (
              <div className="device__activity-list">
                {history.map((item) => {
                  const outgoing = item.source === wallet.address;
                  return (
                    <a
                      className="device__activity-row"
                      href={`https://stellar.expert/explorer/testnet/tx/${item.hash ?? item.id}`}
                      target="_blank"
                      rel="noreferrer"
                      key={item.id}
                    >
                      <span
                        className={`device__activity-icon${outgoing ? " is-outgoing" : ""}`}
                      >
                        {outgoing ? "↑" : "↓"}
                      </span>
                      <span>
                        <strong>
                          {t(
                            outgoing
                              ? "device.wallet.sentTo"
                              : "device.wallet.receivedFrom",
                          )}
                        </strong>
                        <small>
                          {item.destination
                            ? short(item.destination)
                            : item.type}
                        </small>
                      </span>
                      <strong className="device__activity-amount">
                        {item.amount
                          ? `${outgoing ? "−" : "+"}${item.amount} ${item.asset ?? "XLM"}`
                          : item.type}
                      </strong>
                    </a>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (phase === "review" ||
          phase === "signing" ||
          phase === "submitting") &&
        prepared ? (
        <div className="device__stack">
          <h3>{t("device.wallet.review")}</h3>
          <dl className="device__transfer-review">
            <dt>{t("device.wallet.token")}</dt>
            <dd>
              {prepared.asset.code}
              {prepared.asset.issuer && <small>{prepared.asset.issuer}</small>}
            </dd>
            <dt>{t("device.wallet.amount")}</dt>
            <dd>{prepared.amount}</dd>
            <dt>{t("device.wallet.destination")}</dt>
            <dd>{prepared.destination}</dd>
            <dt>{t("device.wallet.fee")}</dt>
            <dd>{prepared.fee} XLM</dd>
            {prepared.memo && (
              <>
                <dt>Memo · {prepared.memo.type}</dt>
                <dd>{prepared.memo.value}</dd>
              </>
            )}
          </dl>
          <button
            type="button"
            className="device__transfer-confirm"
            disabled={busy}
            onClick={confirm}
          >
            {t("device.wallet.confirm")}
          </button>
          <button
            type="button"
            className="device__text-button"
            disabled={busy}
            onClick={() => {
              setPrepared(null);
              setPhase("idle");
            }}
          >
            {t("device.wallet.edit")}
          </button>
        </div>
      ) : hash ? (
        <div className="device__stack">
          <h3>
            {t(
              phase === "success"
                ? "device.wallet.sent"
                : "device.wallet.checkStatus",
            )}
          </h3>
          <code className="device__receive-address">{hash}</code>
          <a
            className="device__system-row"
            href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            {t("device.wallet.explorer")}
          </a>
          <button
            type="button"
            className="device__system-row"
            onClick={() => {
              setHash("");
              setPrepared(null);
              setPhase("idle");
              setAmount("");
            }}
          >
            {t("device.wallet.newTransfer")}
          </button>
        </div>
      ) : (
        <form
          className="device__transfer-form"
          onSubmit={(event) => {
            event.preventDefault();
            review();
          }}
        >
          <label>
            {t("device.wallet.token")}
            <select
              value={assetId}
              disabled={busy || !portfolio}
              onChange={(event) => setAssetId(event.target.value)}
            >
              {(portfolio?.assets ?? []).map((asset) => (
                <option
                  key={asset.id}
                  value={asset.id}
                  disabled={!asset.authorized}
                >
                  {asset.code}
                  {asset.issuer ? ` · ${short(asset.issuer)}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("device.wallet.destination")}
            <input
              required
              value={destination}
              disabled={busy}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="G…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            {t("device.wallet.amount")}
            <input
              required
              value={amount}
              disabled={busy}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0,00"
            />
          </label>
          <label>
            {t("device.wallet.memo")}
            <select
              value={memoType}
              disabled={busy}
              onChange={(event) =>
                setMemoType(event.target.value === "id" ? "id" : "text")
              }
            >
              <option value="text">{t("device.wallet.memoText")}</option>
              <option value="id">{t("device.wallet.memoId")}</option>
            </select>
            <input
              value={memo}
              disabled={busy}
              onChange={(event) => setMemo(event.target.value)}
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            className="device__transfer-confirm"
            disabled={busy || !wallet.signer || !portfolio}
          >
            {t(busy ? "device.wallet.loading" : "device.wallet.review")}
          </button>
        </form>
      )}
      {phase === "signing" || phase === "submitting" ? (
        <p className="device__note" role="status">
          {t(
            phase === "signing"
              ? "device.wallet.signing"
              : "device.wallet.submitting",
          )}
        </p>
      ) : null}
      {message && (
        <p className="device__wallet-error" role="alert">
          {message}
        </p>
      )}
      <a
        className="device__wallet-history-cta"
        href={`https://stellar.expert/explorer/testnet/account/${wallet.address}`}
        target="_blank"
        rel="noreferrer"
      >
        <span>
          <SystemIcon id="files" />
          <span>{t("device.wallet.accountHistory")}</span>
        </span>
        <SystemIcon id="next" />
      </a>
    </div>
  );
}

export function browserAddress(input: string): string {
  const text = input.trim();
  if (!text || text.length > 2000) throw new Error("invalidAddress");
  if (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^https?:\/\//i.test(text))
    throw new Error("invalidAddress");
  if (/\s/.test(text) && !/^https?:\/\//i.test(text))
    return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    !url.hostname.includes(".")
  )
    throw new Error("invalidAddress");
  return url.href;
}
function DeviceBrowser(): ReactElement {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [index, setIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const url = history[index] ?? "";
  const go = (value: string): void => {
    try {
      const address = browserAddress(value);
      setHistory((previous) => [...previous.slice(0, index + 1), address]);
      setIndex(index + 1);
      setText(address);
      setLoading(true);
      setMessage("");
    } catch {
      setMessage(t("device.browser.invalid"));
    }
  };
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => {
      setLoading(false);
      setMessage(t("device.browser.blocked"));
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [loading, url, t, refresh]);
  return (
    <div className="device__browser">
      <form
        className="device__urlbar"
        onSubmit={(event) => {
          event.preventDefault();
          go(text);
        }}
      >
        <SystemIcon id="browser" />
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("device.browser.placeholder")}
          aria-label={t("device.browser.placeholder")}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" aria-label={t("device.browser.go")}>
          <SystemIcon id="next" />
        </button>
      </form>
      <div className="device__browser-toolbar">
        <button
          type="button"
          disabled={index <= 0}
          aria-label={t("device.browser.back")}
          onClick={() => {
            setIndex(index - 1);
            setText(history[index - 1] ?? "");
            setLoading(true);
          }}
        >
          <SystemIcon id="back" />
        </button>
        <button
          type="button"
          disabled={index >= history.length - 1}
          aria-label={t("device.browser.forward")}
          onClick={() => {
            setIndex(index + 1);
            setText(history[index + 1] ?? "");
            setLoading(true);
          }}
        >
          <SystemIcon id="next" />
        </button>
        <button
          type="button"
          disabled={!url}
          onClick={() => {
            setRefresh((value) => value + 1);
            setLoading(true);
          }}
        >
          {t("collection.refresh")}
        </button>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {t("device.browser.external")}
          </a>
        )}
      </div>
      {message && (
        <p className="device__note" role="status">
          {message}
        </p>
      )}
      {loading && (
        <div className="device__browser-loading" role="status">
          {t("device.browser.loading")}
        </div>
      )}
      {url ? (
        <iframe
          key={`${url}:${refresh}`}
          src={url}
          title={t("device.browser.page")}
          sandbox="allow-scripts allow-forms allow-popups"
          referrerPolicy="no-referrer"
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setMessage(t("device.browser.blocked"));
          }}
        />
      ) : (
        <div className="device__browser-start">
          <SystemIcon id="browser" />
          <h3>{t("device.browser.start")}</h3>
          <p className="device__note">{t("device.browser.startBody")}</p>
          {[
            ["Stellar Docs", "https://developers.stellar.org"],
            ["Stellar Expert", "https://stellar.expert/explorer/testnet"],
            ["Example", "https://example.org"],
          ].map(([label, address]) => (
            <button
              className="device__system-row"
              key={address}
              type="button"
              onClick={() => go(address ?? "")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {url && (
        <p className="device__browser-policy">{t("device.browser.policy")}</p>
      )}
    </div>
  );
}

function DeviceNotes({ player }: { player: string | undefined }): ReactElement {
  const { t } = useLanguage();
  const storageKey = `breaker.os.notes.${player ?? "anon"}`;
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  });
  const [saved, setSaved] = useState(true);
  return (
    <div className="device__stack device__notes">
      <label htmlFor="breaker-notes">{t("device.notesLabel")}</label>
      <textarea
        id="breaker-notes"
        value={text}
        maxLength={12000}
        placeholder={t("device.notesPlaceholder")}
        onChange={(event) => {
          setText(event.target.value);
          try {
            localStorage.setItem(storageKey, event.target.value);
            setSaved(true);
          } catch {
            setSaved(false);
          }
        }}
      />
      <p className="device__note" role="status">
        {t(saved ? "device.notesSaved" : "device.notesUnsaved")}
      </p>
      <button
        type="button"
        className="device__system-row"
        disabled={!text.trim()}
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([text], { type: "text/plain;charset=utf-8" }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = "breaker-notes.txt";
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        {t("device.exportNotes")}
      </button>
    </div>
  );
}

function DeviceScanner({
  context,
  onOpenInvestigation,
}: {
  context: FieldContext | undefined;
  onOpenInvestigation: () => void;
}): ReactElement {
  const { t, language } = useLanguage();
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState("");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    if (!active || !video.current || !stream.current) return;
    video.current.srcObject = stream.current;
    void video.current.play().catch(() => {
      if (alive.current) setMessage(t("device.cameraError"));
    });
    type Detector = {
      detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
    };
    const Constructor = (
      window as unknown as {
        BarcodeDetector?: new (options: { formats: string[] }) => Detector;
      }
    ).BarcodeDetector;
    if (!Constructor) {
      setMessage(t("device.qrUnavailable"));
      return;
    }
    const detector = new Constructor({ formats: ["qr_code"] });
    let scanning = false;
    const timer = window.setInterval(() => {
      if (scanning || !video.current || video.current.readyState < 2) return;
      scanning = true;
      void detector
        .detect(video.current)
        .then((items) => {
          if (items[0] && alive.current) setResult(items[0].rawValue);
        })
        .catch(() => {})
        .finally(() => {
          scanning = false;
        });
    }, 500);
    return () => window.clearInterval(timer);
  }, [active, t]);
  const local = (text: NarrativeText): string =>
    text[language] ?? text["pt-BR"];
  return (
    <div className="device__stack">
      {context && (
        <section className="device__scan-brief">
          <span>{t("device.scanner.fieldRecord")}</span>
          <p>{local(context.scan)}</p>
          <button type="button" onClick={onOpenInvestigation}>
            {t("device.scanner.openRecord")}
          </button>
        </section>
      )}
      <p className="device__note">{t("device.cameraNote")}</p>
      <video className="device__camera-preview" ref={video} muted playsInline />
      <button
        type="button"
        className="device__system-row"
        disabled={busy}
        onClick={() => {
          if (active) {
            stream.current?.getTracks().forEach((track) => track.stop());
            stream.current = null;
            setActive(false);
            return;
          }
          setBusy(true);
          setMessage("");
          if (!navigator.mediaDevices?.getUserMedia) {
            setMessage(t("device.cameraError"));
            setBusy(false);
            return;
          }
          void navigator.mediaDevices
            .getUserMedia({
              video: { facingMode: "environment" },
              audio: false,
            })
            .then((value) => {
              if (!alive.current) {
                value.getTracks().forEach((track) => track.stop());
                return;
              }
              stream.current = value;
              setActive(true);
            })
            .catch(() => {
              if (alive.current) setMessage(t("device.cameraError"));
            })
            .finally(() => {
              if (alive.current) setBusy(false);
            });
        }}
      >
        <SystemIcon id="camera" />
        {t(active ? "device.stopCamera" : "device.startCamera")}
      </button>
      <p className="device__note" role="status">
        {message}
      </p>
      {result && <output className="device__qr-result">{result}</output>}
    </div>
  );
}

function BreakerNotes(): ReactElement {
  const { t, language } = useLanguage();
  const { status, completed, solved } = useSeasonProgress();
  if (status === "no-wallet")
    return (
      <div className="device__stack">
        <p className="device__empty">{t("collection.connect")}</p>
      </div>
    );
  if (status === "checking")
    return (
      <div className="device__stack">
        <p className="device__note" aria-live="polite">
          {t("collection.loading")}
        </p>
      </div>
    );
  if (status === "error")
    return (
      <div className="device__stack">
        <p className="device__empty">{t("collection.error")}</p>
      </div>
    );
  const notes = LEVELS.filter((_, index) => completed[index]);
  return (
    <section className="device__case-list" aria-label={t("device.app.cases")}>
      <h2>{t("device.notesArchive.title")}</h2>
      <p className="device__note">
        {t("device.notesArchive.progress", { count: solved })}
      </p>
      {notes.length === 0 ? (
        <p className="device__empty">{t("device.notesArchive.empty")}</p>
      ) : (
        <ul className="device__case-menu">
          {notes.map((caseLevel) => (
            <li key={caseLevel.id} className="device__case-note">
              <span>{levelCode(caseLevel.id)}</span>
              <strong>{choose(caseLevel.name, language)?.text}</strong>
              <p>{choose(caseLevel.summary, language)?.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DeviceIdentity(): ReactElement {
  const wallet = useWallet();
  const { t, language } = useLanguage();
  const { copy, copied } = useCopy();
  const [busy, setBusy] = useState(false);
  const [sessionStarted] = useState(() => new Date());
  return (
    <section className="device__identity" aria-label={t("wallet.title")}>
      <div className="device__operator-avatar">
        <SystemIcon id="operator" />
      </div>
      <strong title={wallet.address ?? undefined}>
        {short(wallet.address ?? undefined)}
      </strong>
      <dl className="device__details">
        <dt>{t("device.network")}</dt>
        <dd>Stellar Testnet</dd>
        <dt>{t("device.operator")}</dt>
        <dd>
          {wallet.state.phase === "connected" ? t("device.status.online") : t("device.guest")}
        </dd>
        <dt>{t("device.session")}</dt>
        <dd>
          {sessionStarted.toLocaleTimeString(language, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </dd>
      </dl>
      <div className="device__wallet-apps">
        {wallet.address && (
          <button
            className="device__tile"
            type="button"
            onClick={() => void copy(wallet.address ?? "")}
          >
            <span
              className="device__glyph device__glyph--cyan"
              aria-hidden="true"
            >
              <DeviceIcon id="copy" />
            </span>
            <span className="device__label" aria-live="polite">
              {t(copied ? "wallet.copied" : "wallet.copy")}
            </span>
          </button>
        )}
        <button
          className="device__tile"
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void (async () => {
              try {
                if (wallet.address) await wallet.disconnect();
                await wallet.connect();
                window.requestAnimationFrame(() => requestBreakerOS());
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          <span
            className="device__glyph device__glyph--amber"
            aria-hidden="true"
          >
            <DeviceIcon id="switch" />
          </span>
          <span className="device__label">
            {t(
              busy
                ? "wallet.connecting"
                : wallet.address
                  ? "wallet.switched"
                  : "wallet.connect",
            )}
          </span>
        </button>
        {wallet.address && (
          <button
            className="device__tile"
            type="button"
            disabled={busy}
            onClick={() => void wallet.disconnect()}
          >
            <span
              className="device__glyph device__glyph--ash"
              aria-hidden="true"
            >
              <DeviceIcon id="disconnect" />
            </span>
            <span className="device__label">{t("wallet.disconnect")}</span>
          </button>
        )}
      </div>
    </section>
  );
}

function DeviceCollection({
  player,
  onClose,
}: {
  player: string | undefined;
  onClose: () => void;
}): ReactElement {
  const { t, language } = useLanguage();
  const { signer } = useWallet();
  const [read, setRead] = useState<{
    player: string;
    completed: readonly boolean[];
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setRead(null);
    setSelected(null);
    if (!player || !signer) return;
    const client = coreClient(player, signer);
    void Promise.all(
      LEVELS.map(
        async (level) =>
          (await client.is_completed({ player, level_id: level.id })).result,
      ),
    )
      .then((completed) => {
        if (alive) {
          setRead({ player, completed });
          setStatus("ready");
        }
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [player, signer, attempt]);
  const confirmed = status === "ready" && read?.player === player;
  const completed = confirmed && read ? read.completed : [];
  const label = (index: number): string =>
    !confirmed
      ? t("collection.unknown")
      : t(completed[index] ? "collection.solved" : "collection.pending");
  const current = selected === null ? undefined : LEVELS[selected];
  if (current !== undefined && selected !== null)
    return (
      <article className="device__collectible">
        <button
          className="device__link"
          type="button"
          onClick={() => setSelected(null)}
        >
          {t("collection.back")}
        </button>
        <ResponsiveImage
          src={levelImage(current.id)}
          alt=""
          sizes="(max-width: 700px) 100vw, 430px"
          loading="lazy"
        />
        <span className="device__note">{levelCode(current.id)}</span>
        <h3>{choose(current.name, language)?.text}</h3>
        <p>{choose(current.summary, language)?.text}</p>
        <p className="device__note">{label(selected)}</p>
        <p className="device__note">{t("collection.ownership")}</p>
        <Link
          className="device__link"
          to={`/level/${current.id}`}
          onClick={onClose}
        >
          {t("collection.openCase")}
        </Link>
      </article>
    );
  return (
    <div className="device__stack">
      <p className="device__note">{t("collection.preview")}</p>
      {!player ? (
        <p className="device__empty">{t("collection.connect")}</p>
      ) : (
        <>
          <p className="device__note" aria-live="polite">
            {status === "loading"
              ? t("collection.loading")
              : status === "error"
                ? t("collection.error")
                : t("collection.progress", {
                    count: completed.filter(Boolean).length,
                    total: LEVELS.length,
                  })}
          </p>
          <button
            className="device__link"
            type="button"
            disabled={status === "loading"}
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t("collection.refresh")}
          </button>
          <SeasonClaim
            completed={
              confirmed &&
              completed.length === LEVELS.length &&
              completed.every(Boolean)
            }
            variant="device"
          />
        </>
      )}
      <div className="device__collection-grid">
        {LEVELS.map((level, index) => (
          <button
            type="button"
            className="device__collectible-card"
            key={level.id}
            onClick={() => setSelected(index)}
          >
            <ResponsiveImage
              src={levelImage(level.id)}
              alt=""
              sizes="(max-width: 700px) 50vw, 190px"
              loading="lazy"
            />
            <strong>{choose(level.name, language)?.text}</strong>
            <span>{label(index)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const GLOBAL_CASE_STATE: CaseNarrative = {
  fired: [],
  revealed: new Set<string>(),
  calls: [],
  hintLevel: 0,
  hints: [],
  assisted: false,
  choices: {},
  requestHint: () => {},
  chooseTone: () => {},
  clear: () => {},
};

export function GlobalBreakerDevice({
  onClose,
  focus,
}: {
  onClose: () => void;
  focus: OsFocus | null;
}): ReactElement {
  const { address } = useWallet();
  return (
    <BreakerDevice
      key={address ?? "anon"}
      level={null}
      narrative={null}
      player={address ?? undefined}
      instance={undefined}
      caseFile={null}
      solved={false}
      open
      onToggle={onClose}
      caseState={GLOBAL_CASE_STATE}
      focus={focus}
      contractSpec={[]}
    />
  );
}
