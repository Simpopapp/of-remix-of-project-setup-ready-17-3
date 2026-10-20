/**
 * Backup I/O da camada de progresso (Fase 3, F3.5).
 *
 * Fluxos de importação exigidos pelo PRD central §6.3/§10:
 * 1. **prévia** — valida + migra em memória e mostra o diff, sem tocar em nada;
 * 2. **mesclar** — combina snapshots existentes com os do backup sem perder
 *    progresso (ver `mergeSnapshot` em `storage.ts`);
 * 3. **substituir** — snapshots/agregados/ajustes passam a ser os do backup
 *    (o log continua append-only, nunca apagamos tentativas);
 * 4. **desfazer** — o estado imediatamente anterior é gravado na MESMA
 *    transação do import (`undo/last-import`) e restaurado atomicamente.
 *
 * Estado ilegível, corrompido ou de **versão futura** nunca é aplicado nem
 * "consertado": o texto cru vai para a store `quarantine` com `add` (nunca
 * `put`) — quarentena somente leitura, sem sobrescrita.
 */

import {
  CURRENT_BACKUP_VERSION,
  createEnvelope,
  parseAttempt,
  inspectEnvelopeVersion,
  migrateEnvelope,
  type BackupVersion,
  type CurrentBackupEnvelope,
  type MigrateFailureReason,
} from "@/domain";
import { PROGRESS_STORES, getStore, requestResult } from "./db";
import type { ProgressStore } from "./storage";

export const DEFAULT_EXPORT_ATTEMPT_LIMIT = 500;

export interface BackupIoOptions {
  store: ProgressStore;
  now?: () => Date;
  device?: string;
  /** default = 500; `0` exporta sem log (válido: log não é fonte de métrica) */
  exportAttemptLimit?: number;
}

export interface ExportBackupOptions {
  /** sobrescreve o limite configurado na instância */
  attemptLimit?: number;
  /** default = agora */
  createdAt?: string;
}

/* ------------------------------------------------------------------ */
/* Prévia                                                             */
/* ------------------------------------------------------------------ */

export interface BackupPreview {
  ok: true;
  /** versão de origem do arquivo */
  version: BackupVersion;
  /** versão corrente após migração aditiva */
  currentVersion: typeof CURRENT_BACKUP_VERSION;
  migrated: boolean;
  createdAt: string;
  device: string | null;
  snapshotCount: number;
  attemptCount: number;
  scoredSnapshotCount: number;
  settingsKeys: string[];
  /** questões do backup que ainda não existem localmente */
  newQuestionCount: number;
  /** questões presentes dos dois lados (serão mescladas) */
  sharedQuestionCount: number;
  /** destas, quantas teriam o melhor score aumentado */
  improvedBestScoreCount: number;
  /** colisões de id com tipo diferente (mantém o snapshot local) */
  typeConflictCount: number;
}

export type BackupInspection =
  | BackupPreview
  | {
      ok: false;
      reason: MigrateFailureReason | "unreadable_json";
      detail: string;
      path: string | null;
      future: boolean;
    };

type ParsedBackup =
  | { ok: true; version: BackupVersion; envelope: CurrentBackupEnvelope }
  | Extract<BackupInspection, { ok: false }>;

/* ------------------------------------------------------------------ */
/* Quarentena                                                         */
/* ------------------------------------------------------------------ */

export type QuarantineReason = MigrateFailureReason | "unreadable_json";

export interface QuarantineRecord {
  id: string;
  createdAt: string;
  reason: QuarantineReason;
  detail: string;
  path: string | null;
  format: string | null;
  version: number | null;
  future: boolean;
  size: number;
  /** texto cru exatamente como recebido — nunca interpretado */
  payload: string;
}

export interface QuarantineSummary {
  id: string;
  createdAt: string;
  reason: QuarantineReason;
  detail: string;
  future: boolean;
  size: number;
}

function serializeRaw(raw: unknown): string {
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return "<payload não serializável>";
  }
}

function byteLength(text: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  return text.length;
}

let quarantineCounter = 0;

function quarantineId(createdAt: string): string {
  quarantineCounter += 1;
  const stamp = createdAt.replace(/[^0-9]/g, "").slice(0, 17);
  const random = Math.random().toString(36).slice(2, 10);
  return `q-${stamp}-${quarantineCounter}-${random}`;
}

function toSummary(record: QuarantineRecord): QuarantineSummary {
  return {
    id: record.id,
    createdAt: record.createdAt,
    reason: record.reason,
    detail: record.detail,
    future: record.future,
    size: record.size,
  };
}

/* ------------------------------------------------------------------ */
/* Serviço                                                            */
/* ------------------------------------------------------------------ */

export class BackupIo {
  private readonly store: ProgressStore;
  private readonly clock: () => Date;
  private readonly device: string | undefined;
  private readonly limit: number;

  constructor(options: BackupIoOptions) {
    this.store = options.store;
    this.clock = options.now ?? (() => new Date());
    this.device = options.device;
    this.limit = options.exportAttemptLimit ?? DEFAULT_EXPORT_ATTEMPT_LIMIT;
  }

  private nowIso(): string {
    return this.clock().toISOString();
  }

  /* ------------------------------ export ---------------------------- */

  async exportEnvelope(options: ExportBackupOptions = {}): Promise<CurrentBackupEnvelope> {
    const snapshots = await this.store.getSnapshots();
    const rawLog = await this.store.getAttemptLog();
    // O log é truncável e não é fonte de métrica: um registro ilegível (versão
    // antiga/escrita manual) é descartado para o backup nunca falhar por causa
    // dele. Snapshots/agregados seguem exportados integralmente.
    const log = rawLog.filter((attempt) => {
      try {
        parseAttempt(attempt);
        return true;
      } catch {
        return false;
      }
    });
    const settings = await this.store.getSettings();
    const aggregates = await this.store.getAggregates();

    const limit = Math.max(0, options.attemptLimit ?? this.limit);
    const ordered = [...log].sort((a, b) => {
      const at = Date.parse(a.submittedAt ?? a.startedAt);
      const bt = Date.parse(b.submittedAt ?? b.startedAt);
      if (Number.isNaN(at) || Number.isNaN(bt) || at === bt) {
        return a.attemptId.localeCompare(b.attemptId);
      }
      return bt - at;
    });
    const attemptsTail = limit === 0 ? [] : ordered.slice(0, limit);

    return createEnvelope(
      { snapshots, attemptsTail, settings, aggregates },
      {
        createdAt: options.createdAt ?? this.nowIso(),
        ...(this.device === undefined ? {} : { device: this.device }),
      },
    );
  }

  /** Arquivo JSON legível (envelope como objeto raiz, nunca array). */
  async exportJson(options: ExportBackupOptions = {}): Promise<string> {
    const envelope = await this.exportEnvelope(options);
    return `${JSON.stringify(envelope, null, 2)}\n`;
  }

  /* ------------------------------ prévia ---------------------------- */

  /**
   * Valida/migra e compara com o estado local. Nenhuma escrita.
   * Entrada com JSON inválido devolve `unreadable_json` (não lança).
   */
  async inspect(raw: unknown): Promise<BackupInspection> {
    const envelope = this.parse(raw);
    if (!envelope.ok) return envelope;

    const local = await this.store.getSnapshots();
    const byId = new Map(local.map((snapshot) => [snapshot.questionId, snapshot]));

    let newQuestionCount = 0;
    let sharedQuestionCount = 0;
    let improvedBestScoreCount = 0;
    let typeConflictCount = 0;

    for (const incoming of envelope.envelope.payload.snapshots) {
      const existing = byId.get(incoming.questionId);
      if (existing === undefined) {
        newQuestionCount += 1;
        continue;
      }
      sharedQuestionCount += 1;
      if (existing.questionType !== incoming.questionType) {
        typeConflictCount += 1;
        continue;
      }
      const incomingBest = incoming.bestScore;
      const existingBest = existing.bestScore;
      if (incomingBest !== null && (existingBest === null || incomingBest > existingBest)) {
        improvedBestScoreCount += 1;
      }
    }

    return {
      ok: true,
      version: envelope.version,
      currentVersion: CURRENT_BACKUP_VERSION,
      migrated: envelope.version !== CURRENT_BACKUP_VERSION,
      createdAt: envelope.envelope.createdAt,
      device: envelope.envelope.device ?? null,
      snapshotCount: envelope.envelope.payload.snapshots.length,
      attemptCount: envelope.envelope.payload.attemptsTail.length,
      scoredSnapshotCount: envelope.envelope.payload.snapshots.filter(
        (snapshot) => snapshot.scoredAttempts > 0,
      ).length,
      settingsKeys: Object.keys(envelope.envelope.payload.settings).sort(),
      newQuestionCount,
      sharedQuestionCount,
      improvedBestScoreCount,
      typeConflictCount,
    };
  }

  private parse(raw: unknown): ParsedBackup {
    let value = raw;
    if (typeof raw === "string") {
      try {
        value = JSON.parse(raw) as unknown;
      } catch (error) {
        return {
          ok: false,
          reason: "unreadable_json",
          detail: error instanceof Error ? error.message : "JSON inválido",
          path: null,
          future: false,
        };
      }
    }
    const inspected = inspectEnvelopeVersion(value);
    const migrated = migrateEnvelope(value);
    if (!migrated.ok) {
      return {
        ok: false,
        reason: migrated.reason,
        detail: migrated.detail,
        path: migrated.path,
        future: inspected.future,
      };
    }
    return {
      ok: true,
      version: migrated.migratedFrom,
      envelope: migrated.envelope,
    };
  }

  /* ---------------------------- importar ---------------------------- */

  /**
   * Importa um envelope cru (texto JSON ou objeto já parseado).
   *
   * Nunca sobrescreve nada em caso de falha: entrada inválida vai para
   * quarentena e o estado local permanece intacto. Sucesso aplica o estado em
   * uma transação atômica, junto com o snapshot de desfazer.
   */
  async import(
    raw: unknown,
    options: { strategy: "merge" | "replace"; saveUndo?: boolean },
  ): Promise<
    | {
        status: "imported";
        preview: BackupPreview;
        result: Awaited<ReturnType<ProgressStore["importState"]>>;
      }
    | { status: "quarantined"; record: QuarantineSummary }
  > {
    const parsed = this.parse(raw);
    if (!parsed.ok) {
      const record = await this.quarantine(
        raw,
        parsed.reason,
        parsed.detail,
        parsed.path,
        parsed.future,
      );
      return { status: "quarantined", record };
    }
    const inspection = await this.inspect(parsed.envelope);
    if (!inspection.ok) {
      const record = await this.quarantine(
        raw,
        inspection.reason,
        inspection.detail,
        inspection.path,
        inspection.future,
      );
      return { status: "quarantined", record };
    }

    const result = await this.store.importState({
      snapshots: parsed.envelope.payload.snapshots,
      attemptsTail: parsed.envelope.payload.attemptsTail,
      settings: parsed.envelope.payload.settings,
      strategy: options.strategy,
      computedAt: this.nowIso(),
      saveUndo: options.saveUndo ?? true,
    });
    return { status: "imported", preview: inspection, result };
  }

  /** Desfaz a última importação (delega ao store). */
  async undo(): Promise<{ restored: boolean; createdAt?: string; reason?: "no_undo" }> {
    const result = await this.store.undoLastImport();
    return result.restored
      ? { restored: true, createdAt: result.createdAt }
      : { restored: false, reason: result.reason };
  }

  /* --------------------------- quarentena --------------------------- */

  /**
   * Guarda o payload cru na quarentena. Usa `add` (nunca `put`): um registro
   * jamais sobrescreve outro, mesmo com o mesmo timestamp.
   */
  async quarantine(
    raw: unknown,
    reason: QuarantineReason,
    detail: string,
    path: string | null = null,
    future?: boolean,
  ): Promise<QuarantineSummary> {
    const createdAt = this.nowIso();
    const text = serializeRaw(raw);
    const inspected = inspectEnvelopeVersion(typeof raw === "string" ? safeJson(raw) : raw);
    const base: Omit<QuarantineRecord, "id"> = {
      createdAt,
      reason,
      detail,
      path,
      format: inspected.format,
      version: inspected.version,
      future: future ?? inspected.future,
      size: byteLength(text),
      payload: text,
    };

    return this.store.db.transaction([PROGRESS_STORES.quarantine], "readwrite", async (tx) => {
      const store = getStore(tx, PROGRESS_STORES.quarantine);
      // `add` (nunca `put`): colisão falha em vez de sobrescrever. O id inclui
      // timestamp + entropia, então colisão é improvável e nunca silenciosa.
      const record: QuarantineRecord = { id: quarantineId(createdAt), ...base };
      await requestResult(store.add(record));
      return toSummary(record);
    });
  }

  /** Lista resumos (sem o payload cru) ordenados do mais recente ao mais antigo. */
  async listQuarantine(): Promise<QuarantineSummary[]> {
    return this.store.db.read(PROGRESS_STORES.quarantine, async (store) => {
      const rows = (await requestResult(store.getAll())) as QuarantineRecord[];
      return rows.map(toSummary).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  /** Lê um registro completo (o texto cru serve para suporte/exportação). */
  async readQuarantine(id: string): Promise<QuarantineRecord | null> {
    return this.store.db.read(PROGRESS_STORES.quarantine, async (store) => {
      const row = (await requestResult(store.get(id))) as QuarantineRecord | undefined;
      return row ?? null;
    });
  }

  /** Exporta a quarentena completa para fora do app (nada é apagado). */
  async exportQuarantine(): Promise<QuarantineRecord[]> {
    return this.store.db.read(PROGRESS_STORES.quarantine, async (store) => {
      return (await requestResult(store.getAll())) as QuarantineRecord[];
    });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function createBackupIo(options: BackupIoOptions): BackupIo {
  return new BackupIo(options);
}
