import { reasonOf } from "../chain/errors.ts";
import type { LocalizedText } from "./text.ts";

export type Callable = Record<
  string,
  (args?: Record<string, unknown>) => Promise<unknown>
>;

export type Compare =
  | "eq"
  | "neq"
  | "true"
  | "false"
  | "defined"
  | "gt"
  | "gte"
  | "lt"
  | "payloadOther";

export type Check = {
  readonly id: string;
  readonly method: string;
  readonly args?: (player: string) => Record<string, unknown>;
  readonly want?: unknown | ((player: string) => unknown);
  readonly wantFrom?: {
    readonly method: string;
    readonly args?: (player: string) => Record<string, unknown>;
  };
  readonly compare: Compare;
  readonly label: LocalizedText;
};

export type CheckResult = {
  readonly id: string;
  readonly label: LocalizedText;
  readonly current: unknown;
  readonly expected: unknown;
  readonly ok: boolean;
};

const FIRST_LAYER = new TextEncoder().encode("FIRST LAYER");

const DIAGNOSTICS: Readonly<Record<number, readonly Check[]>> = {
  0: [
    {
      id: "count",
      method: "count",
      compare: "gte",
      want: 1,
      label: {
        "pt-BR": "O contador chegou a 1",
        en: "The counter reached 1",
        es: "El contador llegó a 1",
      },
    },
  ],
  1: [
    {
      id: "open",
      method: "is_open",
      args: () => ({ door_id: 17 }),
      compare: "true",
      label: { "pt-BR": "A porta 17 está aberta", en: "Door 17 is open", es: "La puerta 17 está abierta" },
    },
    {
      id: "owner",
      method: "owner_of",
      args: () => ({ door_id: 17 }),
      compare: "neq",
      want: (player: string) => player,
      label: {
        "pt-BR": "A porta não pertence a você",
        en: "The door does not belong to you",
        es: "La puerta no te pertenece",
      },
    },
  ],
  2: [
    {
      id: "admin",
      method: "admin",
      compare: "eq",
      want: (player: string) => player,
      label: { "pt-BR": "Você é o administrador", en: "You are the admin", es: "Eres el administrador" },
    },
    {
      id: "released",
      method: "released",
      compare: "true",
      label: { "pt-BR": "O cofre foi liberado", en: "The vault was released", es: "La bóveda fue liberada" },
    },
    {
      id: "balance",
      method: "balance",
      args: (player: string) => ({ who: player }),
      compare: "gt",
      want: 0,
      label: {
        "pt-BR": "O saldo saiu do cofre",
        en: "The balance left the vault",
        es: "El saldo salió de la bóveda",
      },
    },
  ],
  3: [
    {
      id: "owner",
      method: "owner_of",
      args: () => ({ item_id: 17 }),
      compare: "eq",
      want: (player: string) => player,
      label: { "pt-BR": "O item 17 é seu", en: "Item 17 is yours", es: "El objeto 17 es tuyo" },
    },
  ],
  4: [
    {
      id: "renewed",
      method: "renewed",
      args: () => ({ floor_id: 24 }),
      compare: "true",
      label: { "pt-BR": "O andar 24 foi renovado", en: "Floor 24 was renewed", es: "Se renovó el piso 24" },
    },
    {
      id: "floor",
      method: "floor",
      args: () => ({ floor_id: 24 }),
      compare: "eq",
      want: FIRST_LAYER,
      label: {
        "pt-BR": "O registro do andar 24 é FIRST LAYER",
        en: "The floor 24 record is FIRST LAYER",
        es: "El registro del piso 24 es FIRST LAYER",
      },
    },
  ],
  5: [
    {
      id: "controller",
      method: "controller",
      args: () => ({ identity: 1 }),
      compare: "eq",
      want: (player: string) => player,
      label: { "pt-BR": "A identidade 1 é sua", en: "Identity 1 is yours", es: "La identidad 1 es tuya" },
    },
    {
      id: "gate",
      method: "gate_open",
      args: (player: string) => ({ caller: player }),
      compare: "true",
      label: { "pt-BR": "O portão abre para você", en: "The gate opens for you", es: "El portón se abre para ti" },
    },
  ],
  6: [
    {
      id: "recovered",
      method: "recovered",
      compare: "true",
      label: { "pt-BR": "O fragmento foi recuperado", en: "The fragment was recovered", es: "Se recuperó el fragmento" },
    },
    {
      id: "rejected",
      method: "rejected",
      compare: "true",
      label: { "pt-BR": "O Decoder rejeitou", en: "The Decoder rejected", es: "El Decoder rechazó" },
    },
  ],
  7: [
    {
      id: "credit",
      method: "credit",
      args: (player: string) => ({ player }),
      wantFrom: { method: "impossible" },
      compare: "eq",
      label: {
        "pt-BR": "O crédito é o saldo impossível",
        en: "The credit is the impossible balance",
        es: "El crédito equivale al saldo imposible",
      },
    },
  ],
  8: [
    {
      id: "count",
      method: "count",
      wantFrom: { method: "threshold" },
      compare: "gte",
      label: {
        "pt-BR": "O contador alcançou o limite",
        en: "The counter reached the limit",
        es: "El contador alcanzó el límite",
      },
    },
    {
      id: "stored",
      method: "stored",
      wantFrom: { method: "threshold" },
      compare: "lt",
      label: {
        "pt-BR": "O arquivo guarda menos que o limite",
        en: "The archive stores less than the limit",
        es: "El archivo guarda menos que el límite",
      },
    },
    {
      id: "revealed",
      method: "revealed",
      compare: "true",
      label: { "pt-BR": "A cópia de estado foi revelada", en: "The snapshot was revealed", es: "Se reveló la instantánea" },
    },
  ],
  9: [
    {
      id: "streak",
      method: "streak",
      args: (player: string) => ({ player }),
      wantFrom: { method: "required_hits" },
      compare: "gte",
      label: {
        "pt-BR": "A rodada tem três acertos",
        en: "The round has three hits",
        es: "La ronda tiene tres aciertos",
      },
    },
  ],
  10: [
    {
      id: "hatch",
      method: "hatch_open",
      compare: "false",
      want: false,
      label: {
        "pt-BR": "A escotilha aprovada ainda não foi aberta — se já foi, crie outra instância",
        en: "The approved hatch has not run yet — if it has, create another instance",
        es: "La trampilla aprobada aún no se abrió; si ya se abrió, crea otra instancia",
      },
    },
    {
      id: "access",
      method: "access",
      args: (player: string) => ({ player }),
      compare: "true",
      label: { "pt-BR": "O acesso à Spire foi concedido", en: "Spire access was granted", es: "Se concedió acceso a la Spire" },
    },
    {
      id: "rewritten",
      method: "rewritten",
      compare: "true",
      label: { "pt-BR": "A carga útil foi reescrita", en: "The payload was rewritten", es: "Se reescribió la carga útil" },
    },
    {
      id: "key",
      method: "key_rotated",
      compare: "true",
      label: {
        "pt-BR": "A rotação de chave (operação predecessora) foi executada",
        en: "The key rotation (the predecessor) ran",
        es: "Se ejecutó la rotación de clave (operación predecesora)",
      },
    },
    {
      id: "payload",
      method: "payload",
      args: () => ({ op_id: 0 }),
      compare: "eq",
      want: (player: string) => ({ tag: "GrantSpireAccess", values: [player] }),
      label: {
        "pt-BR": "A carga útil da escotilha é GrantSpireAccess(player)",
        en: "The hatch payload is GrantSpireAccess(player)",
        es: "La carga útil de la trampilla es GrantSpireAccess(player)",
      },
    },
    {
      id: "original",
      method: "original",
      args: () => ({ op_id: 0 }),
      compare: "eq",
      want: { tag: "OpenMaintenanceHatch", values: [] },
      label: {
        "pt-BR": "A operação original da escotilha era OpenMaintenanceHatch",
        en: "The hatch operation's original was OpenMaintenanceHatch",
        es: "La operación original de la trampilla era OpenMaintenanceHatch",
      },
    },
  ],
  11: [
    {
      id: "manifest",
      method: "manifest_verified",
      compare: "true",
      label: { "pt-BR": "O manifesto foi verificado", en: "The manifest was verified", es: "Se verificó el manifiesto" },
    },
    {
      id: "context",
      method: "context_verified",
      compare: "true",
      label: {
        "pt-BR": "O contrato vinculou um manifesto ao contexto",
        en: "The contract bound a manifest to the context",
        es: "El contrato vinculó un manifiesto al contexto",
      },
    },
    {
      id: "accepted",
      method: "verified_manifest",
      compare: "defined",
      label: {
        "pt-BR": "O contrato aceitou um manifesto (variante da origem histórica)",
        en: "The contract accepted a manifest (a case variant of the historical origin)",
        es: "El contrato aceptó un manifiesto (con una variación de mayúsculas en el original histórico)",
      },
    },
    {
      id: "voss",
      method: "voss_proof",
      compare: "true",
      label: { "pt-BR": "A prova de Voss foi aceita", en: "The Voss proof was accepted", es: "Se aceptó la prueba de Voss" },
    },
    {
      id: "decoder",
      method: "decoder_failed",
      compare: "true",
      label: { "pt-BR": "O Decoder falhou", en: "The Decoder failed", es: "El Decoder falló" },
    },
  ],
  12: [
    {
      id: "evidence",
      method: "evidence_verified",
      compare: "true",
      label: { "pt-BR": "A evidência foi verificada", en: "The evidence was verified", es: "Se verificó la evidencia" },
    },
    {
      id: "rewritten",
      method: "rewritten",
      compare: "true",
      label: { "pt-BR": "A carga útil foi reescrita", en: "The payload was rewritten", es: "Se reescribió la carga útil" },
    },
    {
      id: "session",
      method: "session",
      args: (player: string) => ({ player }),
      compare: "true",
      label: { "pt-BR": "A sessão pertence ao jogador", en: "The session belongs to the player", es: "La sesión pertenece al jugador" },
    },
    {
      id: "original",
      method: "original",
      compare: "eq",
      want: { tag: "DiagnoseCore", values: [] },
      label: {
        "pt-BR": "A operação original era DiagnoseCore",
        en: "The original operation was DiagnoseCore",
        es: "La operación original era DiagnoseCore",
      },
    },
    {
      id: "executed",
      method: "executed_payload",
      compare: "payloadOther",
      label: {
        "pt-BR": "O payload executado é de outro dono",
        en: "The executed payload belongs to another owner",
        es: "La carga útil ejecutada pertenece a otro titular",
      },
    },
  ],
};

async function call(
  callable: Callable,
  method: string,
  args: Record<string, unknown> | undefined,
): Promise<unknown> {
  const fn = callable[method];
  if (typeof fn !== "function") return "<unavailable>";
  try {
    return await fn(args);
  } catch (error) {
    return `error: ${reasonOf(error)}`;
  }
}

function normalizeUnion(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;

  const shape = value as { tag?: unknown; values?: unknown };
  if (typeof shape.tag === "string") {
    return { tag: shape.tag, values: Array.isArray(shape.values) ? shape.values : [] };
  }

  const keys = Object.keys(value);
  if (keys.length === 1) {
    const key = keys[0];
    if (key === undefined) return value;
    const inner = (value as Record<string, unknown>)[key];
    return {
      tag: key,
      values: inner === undefined ? [] : Array.isArray(inner) ? inner : [inner],
    };
  }

  return value;
}

function sameValue(left: unknown, right: unknown): boolean {
  const a = normalizeUnion(left);
  const b = normalizeUnion(right);

  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    return a.length === b.length && a.every((byte, index) => byte === b[index]);
  }
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  const countedLeft = numeric(a);
  const countedRight = numeric(b);
  if (countedLeft !== null && countedRight !== null) return countedLeft === countedRight;

  return Object.is(a, b);
}

function isOtherPayload(value: unknown, player: string): boolean {
  const shape = normalizeUnion(value) as { tag?: unknown; values?: unknown };
  if (shape.tag !== "OpenForensicSession") return false;
  const who = Array.isArray(shape.values) ? shape.values[0] : undefined;
  return typeof who === "string" && who !== player;
}

function unavailable(value: unknown): boolean {
  return typeof value === "string" && (value === "<unavailable>" || value.startsWith("error: "));
}

function numeric(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  return null;
}

function compare(kind: Compare, current: unknown, expected: unknown, player: string): boolean {
  switch (kind) {
    case "true":
      return current === true;
    case "false":
      return current === false;
    case "defined":
      return current !== undefined && current !== null && !unavailable(current);
    case "eq":
      return !unavailable(current) && sameValue(current, expected);
    case "neq":
      return !unavailable(current) && !sameValue(current, expected);
    case "gt": {
      const left = numeric(current);
      const right = numeric(expected);
      return left !== null && right !== null && left > right;
    }
    case "gte": {
      const left = numeric(current);
      const right = numeric(expected);
      return left !== null && right !== null && left >= right;
    }
    case "lt": {
      const left = numeric(current);
      const right = numeric(expected);
      return left !== null && right !== null && left < right;
    }
    case "payloadOther":
      return isOtherPayload(current, player);
  }
}

export async function readDiagnostics(
  callable: Callable,
  levelId: number,
  player: string,
): Promise<CheckResult[]> {
  const checks = DIAGNOSTICS[levelId] ?? [];

  return Promise.all(
    checks.map(async (check) => {
      const current = await call(callable, check.method, check.args?.(player));
      const expected = check.wantFrom
        ? await call(callable, check.wantFrom.method, check.wantFrom.args?.(player))
        : typeof check.want === "function"
          ? check.want(player)
          : check.want;

      return {
        id: check.id,
        label: check.label,
        current,
        expected,
        ok: compare(check.compare, current, expected, player),
      };
    }),
  );
}

export function displayValue(value: unknown): string {
  if (value instanceof Uint8Array) {
    return Array.from(value)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
