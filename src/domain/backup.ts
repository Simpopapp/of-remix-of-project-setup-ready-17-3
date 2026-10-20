/**
 * Envelope de backup (`pte-master-hub-backup`) + migração só-aditiva.
 *
 * Regras do PRD central §6.3/§10:
 * - O arquivo exportado é um envelope versionado com `format`, `version`,
 *   `createdAt`, `device?` e `payload`.
 * - Migração é APENAS aditiva: campos novos ganham default, nada existente é
 *   removido, renomeado ou reinterpretado.
 * - Versão desconhecida/FUTURA nunca é migrada: `migrateEnvelope` devolve
 *   `reason: "future-version"` e a decisão de quarentena somente leitura é da
 *   Fase 3 — este módulo apenas sinaliza, nunca "conserta".
 * - O log (`attemptsTail`) é truncável e independente dos `snapshots`; um backup
 *   sem log continua válido e não perde métrica.
 *
 * Consumidores: Fase 3 (import/export, prévia, mesclagem, quarentena), Fase 13
 * (E2E de backup). Módulo puro: zero I/O.
 */

import type { Aggregates } from "./aggregates";
import type { Attempt } from "./attempt";
import {
  isRecord,
  parseAggregates,
  parseAttempt,
  expectArray,
  expectIsoTimestamp,
  expectRecord,
  expectString,
  joinPath,
  DomainValidationError,
} from "./schema";
import type { QuestionSnapshot } from "./snapshot";
import { parseSnapshot } from "./schema";

export const BACKUP_FORMAT = "pte-master-hub-backup";

/**
 * Versão corrente do envelope.
 * v1 → v2: adiciona `payload.aggregates` (cache derivável) com default `null`.
 */
export const CURRENT_BACKUP_VERSION = 2;
export const SUPPORTED_BACKUP_VERSIONS = [1, 2] as const;
export type BackupVersion = (typeof SUPPORTED_BACKUP_VERSIONS)[number];

/**
 * Ajustes do aluno dentro do backup. Forma opaca neste pacote: o conteúdo
 * (meta, data da prova, timers, voz TTS, Studie Plus) pertence à Fase 4/10.
 * O envelope só garante que é um objeto e o preserva integralmente.
 */
export type BackupSettings = Record<string, unknown>;

export interface BackupPayloadV1 {
  /** snapshot por questão — fonte das métricas */
  snapshots: QuestionSnapshot[];
  /** cauda do log de tentativas (truncável, nunca fonte única de métrica) */
  attemptsTail: Attempt[];
  settings: BackupSettings;
}

/** v2 adiciona o cache de agregados (recomputável a partir dos snapshots). */
export interface BackupPayloadV2 extends BackupPayloadV1 {
  aggregates: Aggregates | null;
}

export interface BackupEnvelopeV1 {
  format: typeof BACKUP_FORMAT;
  version: 1;
  /** instante ISO do export */
  createdAt: string;
  device?: string;
  payload: BackupPayloadV1;
}

export interface BackupEnvelopeV2 {
  format: typeof BACKUP_FORMAT;
  version: 2;
  createdAt: string;
  device?: string;
  payload: BackupPayloadV2;
}

export type BackupEnvelope = BackupEnvelopeV1 | BackupEnvelopeV2;
/** Forma devolvida por `parseEnvelope`/`migrateEnvelope` (sempre a corrente). */
export type CurrentBackupEnvelope = BackupEnvelopeV2;

/* ------------------------------------------------------------------ */
/* Validação do payload                                                */
/* ------------------------------------------------------------------ */

function parseBackupSettings(raw: unknown, path: string): BackupSettings {
  return expectRecord(raw, path);
}

/**
 * Valida o payload na versão informada. Exportado para a prévia de importação
 * (Fase 3) validar antes de tocar em dados do aluno.
 */
export function parseBackupPayload(
  raw: unknown,
  version: BackupVersion,
  path = "envelope.payload",
): BackupPayloadV1 | BackupPayloadV2 {
  const record = expectRecord(raw, path);

  const snapshotsPath = joinPath(path, "snapshots");
  const snapshotItems = expectArray(record["snapshots"], snapshotsPath);
  const seen = new Set<string>();
  const snapshots = snapshotItems.map((item, index) => {
    const at = joinPath(snapshotsPath, index);
    const snapshot = parseSnapshot(item, at);
    if (seen.has(snapshot.questionId)) {
      throw new DomainValidationError(
        "inconsistent",
        joinPath(at, "questionId"),
        `snapshot duplicado para ${snapshot.questionId}`,
      );
    }
    seen.add(snapshot.questionId);
    return snapshot;
  });

  const attemptsPath = joinPath(path, "attemptsTail");
  const attemptsTail = expectArray(record["attemptsTail"], attemptsPath).map((item, index) =>
    parseAttempt(item, joinPath(attemptsPath, index)),
  );

  const settings = parseBackupSettings(record["settings"], joinPath(path, "settings"));

  const base: BackupPayloadV1 = { snapshots, attemptsTail, settings };
  if (version === 1) return base;

  const aggregatesPath = joinPath(path, "aggregates");
  const aggregates = record["aggregates"];
  return {
    ...base,
    aggregates:
      aggregates === null || aggregates === undefined
        ? null
        : parseAggregates(aggregates, aggregatesPath),
  };
}

/* ------------------------------------------------------------------ */
/* Migração                                                            */
/* ------------------------------------------------------------------ */

export type MigrateFailureReason =
  | "not_object"
  | "wrong_format"
  | "missing_version"
  | "invalid_version"
  | "future_version"
  | "corrupt_payload";

export type MigrateEnvelopeResult =
  | {
      ok: true;
      envelope: CurrentBackupEnvelope;
      /** versão de origem (2 = já corrente) */
      migratedFrom: BackupVersion;
    }
  | {
      ok: false;
      reason: MigrateFailureReason;
      /** caminho do problema, ex.: `envelope.payload.snapshots[3].srsBox` */
      path: string;
      detail: string;
    };

/** Lê formato/versão sem validar o payload (útil para decidir quarentena). */
export function inspectEnvelopeVersion(raw: unknown): {
  format: string | null;
  version: number | null;
  future: boolean;
} {
  if (!isRecord(raw)) return { format: null, version: null, future: false };
  const format = typeof raw["format"] === "string" ? raw["format"] : null;
  const version = typeof raw["version"] === "number" ? raw["version"] : null;
  return {
    format,
    version,
    future: version !== null && Number.isInteger(version) && version > CURRENT_BACKUP_VERSION,
  };
}

/**
 * Migra um envelope cru (JSON já parseado) para a versão corrente.
 *
 * Nunca lança para entrada inválida: devolve `ok: false` com motivo e caminho,
 * porque a importação precisa decidir entre quarentena (versão futura), erro de
 * arquivo (formato errado) e corrupção — sem sobrescrever nada.
 */
export function migrateEnvelope(raw: unknown, path = "envelope"): MigrateEnvelopeResult {
  if (!isRecord(raw)) {
    return {
      ok: false,
      reason: "not_object",
      path,
      detail: `esperado objeto, recebeu ${raw === null ? "null" : typeof raw}`,
    };
  }

  if (raw["format"] !== BACKUP_FORMAT) {
    return {
      ok: false,
      reason: "wrong_format",
      path: joinPath(path, "format"),
      detail: `esperado "${BACKUP_FORMAT}", recebeu ${JSON.stringify(raw["format"])}`,
    };
  }

  const versionRaw = raw["version"];
  if (versionRaw === undefined || versionRaw === null) {
    return {
      ok: false,
      reason: "missing_version",
      path: joinPath(path, "version"),
      detail: "envelope sem versão",
    };
  }
  if (typeof versionRaw !== "number" || !Number.isInteger(versionRaw) || versionRaw < 1) {
    return {
      ok: false,
      reason: "invalid_version",
      path: joinPath(path, "version"),
      detail: `versão inválida: ${JSON.stringify(versionRaw)}`,
    };
  }
  if (versionRaw > CURRENT_BACKUP_VERSION) {
    // Versão futura: nunca migra. Quarentena somente leitura é decisão da Fase 3.
    return {
      ok: false,
      reason: "future_version",
      path: joinPath(path, "version"),
      detail: `versão ${versionRaw} é mais nova que a suportada (${CURRENT_BACKUP_VERSION})`,
    };
  }
  if (!(SUPPORTED_BACKUP_VERSIONS as readonly number[]).includes(versionRaw)) {
    return {
      ok: false,
      reason: "invalid_version",
      path: joinPath(path, "version"),
      detail: `versão não suportada: ${versionRaw}`,
    };
  }

  const version = versionRaw as BackupVersion;
  let payload: BackupPayloadV1 | BackupPayloadV2;
  let createdAt: string;
  try {
    createdAt = expectIsoTimestamp(raw["createdAt"], joinPath(path, "createdAt"));
    payload = parseBackupPayload(raw["payload"], version, joinPath(path, "payload"));
  } catch (error) {
    if (error instanceof DomainValidationError) {
      return { ok: false, reason: "corrupt_payload", path: error.path, detail: error.message };
    }
    throw error;
  }

  const device =
    raw["device"] === undefined ? undefined : expectString(raw["device"], joinPath(path, "device"));

  // Preserva campos desconhecidos — no envelope E no payload — porque a migração
  // é estritamente aditiva: nada é descartado, só se acrescenta o default da
  // versão nova. Os campos validados vencem os crus (mesma chave).
  const rawPayload = isRecord(raw["payload"]) ? raw["payload"] : {};
  const migrated: Record<string, unknown> = {
    ...raw,
    format: BACKUP_FORMAT,
    version: CURRENT_BACKUP_VERSION,
    createdAt,
    payload:
      version === 1
        ? { ...rawPayload, ...(payload as BackupPayloadV1), aggregates: null }
        : { ...rawPayload, ...(payload as BackupPayloadV2) },
  };
  if (device !== undefined) migrated["device"] = device;
  else delete migrated["device"];

  return {
    ok: true,
    envelope: migrated as unknown as CurrentBackupEnvelope,
    migratedFrom: version,
  };
}

/**
 * Valida e devolve o envelope corrente. Lança `DomainValidationError`
 * (`future_version` inclusive) — use quando o chamador já decidiu que entrada
 * inválida é erro, não quarentena.
 */
export function parseEnvelope(raw: unknown, path = "envelope"): CurrentBackupEnvelope {
  const result = migrateEnvelope(raw, path);
  if (result.ok) return result.envelope;
  const code =
    result.reason === "future_version"
      ? "future_version"
      : result.reason === "not_object"
        ? "not_object"
        : result.reason === "wrong_format"
          ? "invalid_literal"
          : result.reason === "missing_version"
            ? "missing"
            : result.reason === "invalid_version"
              ? "out_of_range"
              : "inconsistent";
  throw new DomainValidationError(code, result.path, result.detail);
}

/* ------------------------------------------------------------------ */
/* Criação                                                             */
/* ------------------------------------------------------------------ */

export interface CreateEnvelopeInput {
  snapshots: QuestionSnapshot[];
  attemptsTail: Attempt[];
  settings: BackupSettings;
  aggregates?: Aggregates | null;
}

/** Cria o envelope corrente já validado (exportação nunca gera arquivo inválido). */
export function createEnvelope(
  input: CreateEnvelopeInput,
  options: { createdAt?: string; device?: string } = {},
): CurrentBackupEnvelope {
  const draft: Record<string, unknown> = {
    format: BACKUP_FORMAT,
    version: CURRENT_BACKUP_VERSION,
    createdAt: options.createdAt ?? new Date().toISOString(),
    payload: {
      snapshots: input.snapshots,
      attemptsTail: input.attemptsTail,
      settings: input.settings,
      aggregates: input.aggregates ?? null,
    },
  };
  if (options.device !== undefined) draft["device"] = options.device;
  const parsed = parseEnvelope(draft);
  return options.device === undefined ? parsed : { ...parsed, device: options.device };
}
