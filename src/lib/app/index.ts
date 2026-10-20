/**
 * Ponto de entrada da camada de progresso local (Fase 3).
 *
 * Uso típico (Fase 4+):
 * ```ts
 * const progress = await openProgressLayer();
 * await progress.store.submitAttempt(attempt, { questionType: "wfd" });
 * const json = await progress.backup.exportJson();
 * ```
 *
 * Tudo aqui é local e determinístico: nenhuma chamada de rede, nenhuma IA.
 * A única dependência de plataforma é IndexedDB (injetável via `fake-indexeddb`
 * nos testes).
 */

import { openProgressDb, type ProgressDatabase, type ProgressDbOpenOptions } from "./db";
import { BackupIo, type BackupIoOptions } from "./backup-io";
import { MediaStore, type MediaStoreOptions } from "./media";
import {
  ProgressStore,
  type ProgressStoreOptions,
  type SkillWeightResolver,
  type TruncationPolicy,
} from "./storage";

export * from "./db";
export * from "./srs";
export * from "./storage";
export * from "./backup-io";
export * from "./media";

export interface ProgressLayer {
  db: ProgressDatabase;
  store: ProgressStore;
  backup: BackupIo;
  media: MediaStore;
  close: () => void;
}

export interface OpenProgressLayerOptions {
  dbName?: string;
  /** fábrica injetável (testes) — `null` força indisponibilidade */
  indexedDB?: IDBFactory | null;
  now?: () => Date;
  truncation?: Partial<TruncationPolicy>;
  skillWeights?: SkillWeightResolver;
  autoTruncate?: boolean;
  device?: string;
  exportAttemptLimit?: number;
  quotaEstimator?: MediaStoreOptions["quotaEstimator"];
}

/**
 * Abre o banco e monta os serviços com a MESMA conexão (transações atômicas
 * entre snapshot, log, agregados, backup e mídia).
 */
export async function openProgressLayer(
  options: OpenProgressLayerOptions = {},
): Promise<ProgressLayer> {
  const dbOptions: ProgressDbOpenOptions = {
    ...(options.dbName === undefined ? {} : { name: options.dbName }),
    ...(options.indexedDB === undefined ? {} : { indexedDB: options.indexedDB }),
  };
  const db = await openProgressDb(dbOptions);
  const common = {
    db,
    ...(options.now === undefined ? {} : { now: options.now }),
  };
  const store = new ProgressStore({
    ...common,
    ...(options.truncation === undefined ? {} : { truncation: options.truncation }),
    ...(options.skillWeights === undefined ? {} : { skillWeights: options.skillWeights }),
    ...(options.autoTruncate === undefined ? {} : { autoTruncate: options.autoTruncate }),
  } satisfies ProgressStoreOptions);
  const backupOptions: BackupIoOptions = {
    store,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.device === undefined ? {} : { device: options.device }),
    ...(options.exportAttemptLimit === undefined
      ? {}
      : { exportAttemptLimit: options.exportAttemptLimit }),
  };
  const backup = new BackupIo(backupOptions);
  const mediaOptions: MediaStoreOptions = {
    db,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.quotaEstimator === undefined ? {} : { quotaEstimator: options.quotaEstimator }),
  };
  const media = new MediaStore(mediaOptions);

  return {
    db,
    store,
    backup,
    media,
    close: () => {
      db.close();
    },
  };
}
