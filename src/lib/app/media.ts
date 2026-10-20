/**
 * Mídia local (Fase 3, F3.6): gravações de fala e aviso preventivo de quota.
 *
 * Decisões:
 * - Guardamos `ArrayBuffer` + metadados em vez de `Blob`: funciona igual em
 *   navegador e em `fake-indexeddb`/jsdom, e o consumidor reconstrói o Blob
 *   com o `mimeType` quando precisar tocar/ouvir.
 * - O buffer é lido (`await blob.arrayBuffer()`) ANTES de abrir a transação —
 *   nunca seguramos uma transação IndexedDB esperando I/O assíncrono.
 * - A quota é apenas AVISO: gravar nunca é bloqueado por estimativa. Se o
 *   navegador recusar com `QuotaExceededError`, devolvemos `ok: false` e a UI
 *   (Fase 6) mostra o aviso preventivo para o aluno liberar espaço.
 * - `navigator.storage.estimate()` pode não existir (Safari antigo/SSR); nesse
 *   caso o nível é `unknown` e a mensagem diz que não há estimativa — nunca
 *   fingimos saber a quota.
 */

import {
  PROGRESS_STORES,
  ProgressTransactionError,
  getStore,
  requestResult,
  type ProgressDatabase,
} from "./db";

export const QUOTA_WARN_RATIO = 0.8;
export const QUOTA_CRITICAL_RATIO = 0.95;

export interface QuotaEstimate {
  usage: number;
  quota: number;
  available: number;
  /** uso / quota (0–1) */
  ratio: number;
}

export type QuotaLevel = "ok" | "warn" | "critical" | "unknown";

export interface QuotaWarning {
  level: QuotaLevel;
  /** mensagem pronta para a UI (pt-BR); `null` quando nível `ok` */
  message: string | null;
  requiredBytes: number;
  estimate: QuotaEstimate | null;
}

export type QuotaEstimator = () => Promise<QuotaEstimate | null>;

export interface MediaMetadata {
  id: string;
  questionId: string | null;
  attemptId: string | null;
  mimeType: string;
  byteSize: number;
  durationMs: number | null;
  createdAt: string;
  label: string | null;
}

export interface StoredRecording extends MediaMetadata {
  data: ArrayBuffer;
}

export interface SaveRecordingInput {
  /** sinal de áudio; `Blob` é convertido antes da transação */
  blob: Blob | ArrayBuffer;
  mimeType?: string;
  questionId?: string | null;
  attemptId?: string | null;
  durationMs?: number | null;
  label?: string | null;
}

export type SaveRecordingResult =
  | { ok: true; meta: MediaMetadata; warning: QuotaWarning }
  | {
      ok: false;
      error: "quota_exceeded" | "storage_error";
      message: string;
      warning: QuotaWarning;
    };

export interface MediaStoreOptions {
  db: ProgressDatabase;
  now?: () => Date;
  quotaEstimator?: QuotaEstimator;
}

/** Estimador padrão via `navigator.storage.estimate()` (pode não existir). */
export const browserQuotaEstimator: QuotaEstimator = async () => {
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  if (storage === undefined || typeof storage.estimate !== "function") return null;
  try {
    const estimate = await storage.estimate();
    const usage = typeof estimate.usage === "number" ? estimate.usage : null;
    const quota = typeof estimate.quota === "number" ? estimate.quota : null;
    if (usage === null || quota === null || quota <= 0) return null;
    return {
      usage,
      quota,
      available: Math.max(0, quota - usage),
      ratio: Math.min(1, usage / quota),
    };
  } catch {
    return null;
  }
};

function isQuotaError(error: unknown): boolean {
  if (error instanceof ProgressTransactionError) return isQuotaError(error.cause);
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "QuotaExceededError" || error.code === 22;
  }
  if (error instanceof Error) return error.name === "QuotaExceededError";
  return false;
}

let mediaCounter = 0;

function mediaId(createdAt: string): string {
  mediaCounter += 1;
  const stamp = createdAt.replace(/[^0-9]/g, "").slice(0, 17);
  return `media-${stamp}-${mediaCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

function toMeta(record: StoredRecording): MediaMetadata {
  return {
    id: record.id,
    questionId: record.questionId,
    attemptId: record.attemptId,
    mimeType: record.mimeType,
    byteSize: record.byteSize,
    durationMs: record.durationMs,
    createdAt: record.createdAt,
    label: record.label,
  };
}

export class MediaStore {
  private readonly db: ProgressDatabase;
  private readonly clock: () => Date;
  private readonly estimate: QuotaEstimator;

  constructor(options: MediaStoreOptions) {
    this.db = options.db;
    this.clock = options.now ?? (() => new Date());
    this.estimate = options.quotaEstimator ?? browserQuotaEstimator;
  }

  private nowIso(): string {
    return this.clock().toISOString();
  }

  async estimateQuota(): Promise<QuotaEstimate | null> {
    return this.estimate();
  }

  /**
   * Avalia a quota ANTES de gravar. Sempre devolve um `QuotaWarning`; níveis
   * `warn`/`critical` trazem texto para a UI e a gravação ainda é tentada.
   */
  async checkQuota(requiredBytes: number): Promise<QuotaWarning> {
    const estimate = await this.estimateQuota();
    if (estimate === null) {
      return {
        level: "unknown",
        message:
          "Este navegador não informa o espaço disponível; a gravação pode falhar se o armazenamento estiver cheio.",
        requiredBytes,
        estimate: null,
      };
    }
    if (estimate.available < requiredBytes) {
      return {
        level: "critical",
        message:
          "O espaço estimado livre é menor que esta gravação. Libere espaço antes de gravar para não perder o áudio.",
        requiredBytes,
        estimate,
      };
    }
    if (estimate.ratio >= QUOTA_CRITICAL_RATIO) {
      return {
        level: "critical",
        message:
          "O armazenamento está quase cheio. Libere gravações antigas ou exporte um backup antes de continuar.",
        requiredBytes,
        estimate,
      };
    }
    if (estimate.ratio >= QUOTA_WARN_RATIO) {
      return {
        level: "warn",
        message:
          "O armazenamento está ficando cheio. Considere exportar um backup e remover gravações antigas.",
        requiredBytes,
        estimate,
      };
    }
    return { level: "ok", message: null, requiredBytes, estimate };
  }

  /**
   * Persiste uma gravação. Nunca bloqueia por estimativa; devolve o aviso
   * junto com o sucesso para a UI exibir a tempo.
   */
  async saveRecording(input: SaveRecordingInput): Promise<SaveRecordingResult> {
    const buffer = input.blob instanceof ArrayBuffer ? input.blob : await input.blob.arrayBuffer();
    if (buffer.byteLength === 0) {
      const warning = await this.checkQuota(0);
      return {
        ok: false,
        error: "storage_error",
        message: "A gravação está vazia; nada foi salvo.",
        warning,
      };
    }

    const warning = await this.checkQuota(buffer.byteLength);
    const createdAt = this.nowIso();
    const mimeType =
      input.mimeType ??
      (typeof Blob !== "undefined" && input.blob instanceof Blob && input.blob.type
        ? input.blob.type
        : "application/octet-stream");
    const record: StoredRecording = {
      id: mediaId(createdAt),
      questionId: input.questionId ?? null,
      attemptId: input.attemptId ?? null,
      mimeType,
      byteSize: buffer.byteLength,
      durationMs: input.durationMs ?? null,
      createdAt,
      label: input.label ?? null,
      data: buffer,
    };

    try {
      await this.db.transaction([PROGRESS_STORES.media], "readwrite", async (tx) => {
        const store = getStore(tx, PROGRESS_STORES.media);
        await requestResult(store.add(record));
      });
      return { ok: true, meta: toMeta(record), warning };
    } catch (error) {
      if (isQuotaError(error)) {
        return {
          ok: false,
          error: "quota_exceeded",
          message:
            "Não há espaço para salvar o áudio. Libere gravações antigas ou exporte um backup.",
          warning: { ...warning, level: "critical" },
        };
      }
      return {
        ok: false,
        error: "storage_error",
        message: "Não foi possível salvar a gravação neste dispositivo.",
        warning,
      };
    }
  }

  async listRecordings(questionId?: string): Promise<MediaMetadata[]> {
    return this.db.read(PROGRESS_STORES.media, async (store) => {
      const rows =
        questionId === undefined
          ? ((await requestResult(store.getAll())) as StoredRecording[])
          : ((await requestResult(
              store.index("byQuestionId").getAll(questionId),
            )) as StoredRecording[]);
      return rows.map(toMeta).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  async getRecording(id: string): Promise<StoredRecording | null> {
    return this.db.read(PROGRESS_STORES.media, async (store) => {
      const row = (await requestResult(store.get(id))) as StoredRecording | undefined;
      return row ?? null;
    });
  }

  /** Reconstrói um `Blob` tocável (a UI usa URL.createObjectURL). */
  async getRecordingBlob(id: string): Promise<Blob | null> {
    const record = await this.getRecording(id);
    if (record === null) return null;
    if (typeof Blob === "undefined") return null;
    return new Blob([record.data], { type: record.mimeType });
  }

  /** Remoção explícita pelo aluno (Ajustes). Devolve o metadado removido. */
  async deleteRecording(id: string): Promise<MediaMetadata | null> {
    return this.db.transaction([PROGRESS_STORES.media], "readwrite", async (tx) => {
      const store = getStore(tx, PROGRESS_STORES.media);
      const row = (await requestResult(store.get(id))) as StoredRecording | undefined;
      if (row === undefined) return null;
      await requestResult(store.delete(id));
      return toMeta(row);
    });
  }

  /** Bytes ocupados por gravações (para a tela de Ajustes). */
  async totalBytes(): Promise<number> {
    const rows = await this.db.read(PROGRESS_STORES.media, async (store) => {
      return (await requestResult(store.getAll())) as StoredRecording[];
    });
    return rows.reduce((total, row) => total + row.byteSize, 0);
  }
}

export function createMediaStore(options: MediaStoreOptions): MediaStore {
  return new MediaStore(options);
}
