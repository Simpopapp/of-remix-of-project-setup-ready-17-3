/**
 * Wrapper de IndexedDB da camada de progresso local (Fase 3, F3.1).
 *
 * Por que um wrapper e não `indexedDB` cru espalhado pelo app:
 * - um único lugar define os object stores e a versão do schema;
 * - toda escrita multi-store passa por `transaction()` — IndexedDB já é atômico
 *   por transação, então snapshot + log + agregados nunca ficam misturados;
 * - a indisponibilidade (navegador sem IndexedDB, modo privado restrito, SSR)
 *   vira um erro tipado (`ProgressDbUnavailableError`) em vez de `undefined`
 *   silencioso, permitindo degradação explícita na Fase 4.
 *
 * Sem I/O em escopo de módulo: `globalThis.indexedDB` só é lido dentro de
 * `openProgressDb`, e o teste injeta `fake-indexeddb` por parâmetro — os testes
 * nunca dependem do ambiente global.
 *
 * Consumidores: `storage.ts` (snapshots/agregados/log), `backup-io.ts`
 * (quarentena/undo), `media.ts` (gravações de áudio). Nenhum outro módulo deve
 * abrir o banco diretamente.
 */

/** Nome padrão do banco. O produto tem um único perfil local (§8 do PRD). */
export const PROGRESS_DB_NAME = "pte-master-hub";
/** Versão do schema de persistência (migrações só-aditivas). */
export const PROGRESS_DB_VERSION = 1;

/** Object stores do progresso local. */
export const PROGRESS_STORES = {
  /** `QuestionSnapshot` por `questionId` (fonte das métricas) */
  snapshots: "snapshots",
  /** cache único `{ id: "current", value: Aggregates }` */
  aggregates: "aggregates",
  /** pontos diários por série (`overall`, `type:*`, `section:*`, `skill:*`) */
  aggregateHistory: "aggregateHistory",
  /** log append-only de tentativas (truncável) */
  attempts: "attempts",
  /** gravações de áudio (`ArrayBuffer` + metadados) */
  media: "media",
  /** envelopes de backup ilegíveis/versão futura — somente leitura */
  quarantine: "quarantine",
  /** estado imediatamente anterior à última importação (desfazer) */
  undo: "undo",
  /** pares chave/valor: ajustes opacos, versão de schema, políticas */
  meta: "meta",
} as const;

export type ProgressStoreName = (typeof PROGRESS_STORES)[keyof typeof PROGRESS_STORES];

export const PROGRESS_STORE_NAMES: readonly ProgressStoreName[] = Object.values(PROGRESS_STORES);

/** Erro: IndexedDB não existe/injetado como indisponível. */
export class ProgressDbUnavailableError extends Error {
  readonly code = "indexeddb_unavailable" as const;

  constructor(detail = "IndexedDB não está disponível neste ambiente") {
    super(detail);
    this.name = "ProgressDbUnavailableError";
  }
}

/** Erro: transação abortou (erro de request, exceção no callback ou quota). */
export class ProgressTransactionError extends Error {
  readonly code = "transaction_failed" as const;
  readonly storeNames: readonly ProgressStoreName[];
  override readonly cause: unknown;

  constructor(
    storeNames: readonly ProgressStoreName[],
    cause: unknown,
    detail = "transação de progresso abortada",
  ) {
    super(`${detail}: ${describeCause(cause)}`);
    this.name = "ProgressTransactionError";
    this.storeNames = storeNames;
    this.cause = cause;
  }
}

/** O banco foi fechado antes da operação. */
export class ProgressDbClosedError extends Error {
  readonly code = "indexeddb_closed" as const;

  constructor() {
    super("banco de progresso fechado");
    this.name = "ProgressDbClosedError";
  }
}

const IDB_ERROR_NAMES = new Set([
  "AbortError",
  "ConstraintError",
  "DataCloneError",
  "DataError",
  "InvalidAccessError",
  "InvalidStateError",
  "NotFoundError",
  "QuotaExceededError",
  "ReadOnlyError",
  "TransactionInactiveError",
  "UnknownError",
  "VersionError",
]);

function isIndexedDbError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) return true;
  return error instanceof Error && IDB_ERROR_NAMES.has(error.name);
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  if (typeof cause === "string") return cause;
  return String(cause);
}

export interface ProgressDbOpenOptions {
  name?: string;
  version?: number;
  /**
   * Fábrica injetável. `undefined` = usa `globalThis.indexedDB` se existir;
   * `null` = força indisponibilidade (teste de degradação).
   */
  indexedDB?: IDBFactory | null;
}

/** Converte uma request do IndexedDB em Promise (sem rejeitar em `onblocked`). */
export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("request do IndexedDB falhou"));
  });
}

/** Espera o término da transação (commit ou abort). */
function transactionCompletion(
  tx: IDBTransaction,
  storeNames: readonly ProgressStoreName[],
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(new ProgressTransactionError(storeNames, tx.error ?? "erro de transação"));
    tx.onabort = () =>
      reject(new ProgressTransactionError(storeNames, tx.error ?? "transação abortada"));
  });
}

/** Acesso tipado ao object store (nome já validado pelo schema). */
export function getStore(tx: IDBTransaction, name: ProgressStoreName): IDBObjectStore {
  return tx.objectStore(name);
}

/** Cria os stores na primeira abertura (e nunca recria os existentes). */
function ensureSchema(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(PROGRESS_STORES.snapshots)) {
    db.createObjectStore(PROGRESS_STORES.snapshots, { keyPath: "questionId" });
  }
  if (!db.objectStoreNames.contains(PROGRESS_STORES.aggregates)) {
    db.createObjectStore(PROGRESS_STORES.aggregates, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(PROGRESS_STORES.aggregateHistory)) {
    const store = db.createObjectStore(PROGRESS_STORES.aggregateHistory, { keyPath: "key" });
    store.createIndex("bySeries", "series", { unique: false });
  }
  if (!db.objectStoreNames.contains(PROGRESS_STORES.attempts)) {
    const store = db.createObjectStore(PROGRESS_STORES.attempts, { keyPath: "attemptId" });
    store.createIndex("byQuestionId", "questionId", { unique: false });
  }
  if (!db.objectStoreNames.contains(PROGRESS_STORES.media)) {
    const store = db.createObjectStore(PROGRESS_STORES.media, { keyPath: "id" });
    store.createIndex("byQuestionId", "questionId", { unique: false });
  }
  if (!db.objectStoreNames.contains(PROGRESS_STORES.quarantine)) {
    const store = db.createObjectStore(PROGRESS_STORES.quarantine, { keyPath: "id" });
    store.createIndex("byCreatedAt", "createdAt", { unique: false });
  }
  if (!db.objectStoreNames.contains(PROGRESS_STORES.undo)) {
    db.createObjectStore(PROGRESS_STORES.undo, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(PROGRESS_STORES.meta)) {
    db.createObjectStore(PROGRESS_STORES.meta, { keyPath: "key" });
  }
}

/**
 * Conexão aberta com o banco de progresso.
 *
 * `transaction()` é a única porta de escrita: o callback recebe a transação,
 * emite requests e pode lançar — nesse caso a transação é abortada e nada é
 * persistido (atomicidade provada em `src/test/app/loss.test.ts`).
 */
export class ProgressDatabase {
  readonly name: string;
  readonly version: number;
  private readonly db: IDBDatabase;
  private closed = false;

  constructor(db: IDBDatabase) {
    this.db = db;
    this.name = db.name;
    this.version = db.version;
    this.db.onversionchange = () => {
      this.closed = true;
      this.db.close();
    };
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Nomes de stores da conexão (diagnóstico e teste de schema). */
  get objectStoreNames(): DOMStringList {
    return this.db.objectStoreNames;
  }

  /**
   * Executa `fn` numa transação. A Promise resolve depois do `complete` da
   * transação, nunca antes — quem chama sabe que o dado está realmente gravado.
   */
  async transaction<T>(
    storeNames: readonly ProgressStoreName[],
    mode: IDBTransactionMode,
    fn: (tx: IDBTransaction) => Promise<T> | T,
  ): Promise<T> {
    if (this.closed) throw new ProgressDbClosedError();
    if (storeNames.length === 0) {
      throw new TypeError("transaction: informe ao menos um object store");
    }
    const tx = this.db.transaction([...storeNames], mode);
    const completion = transactionCompletion(tx, storeNames);
    let result: T;
    try {
      result = await fn(tx);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // transação já finalizada: o erro original continua sendo a causa.
      }
      // Evita rejeição não tratada: o resultado real é o erro do callback.
      void completion.catch(() => undefined);
      // Erro de request do IndexedDB (ConstraintError, QuotaExceededError…)
      // vira erro de transação tipado; erros de domínio (`ProgressStoreError`)
      // seguem intactos para a camada de aplicação.
      throw isIndexedDbError(error)
        ? new ProgressTransactionError(storeNames, error, "request do IndexedDB falhou")
        : error;
    }
    await completion;
    return result;
  }

  /** Leitura de um único store (atalho para leituras simples). */
  async read<T>(
    storeName: ProgressStoreName,
    fn: (store: IDBObjectStore) => Promise<T> | T,
  ): Promise<T> {
    return this.transaction([storeName], "readonly", (tx) => fn(getStore(tx, storeName)));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}

function resolveFactory(options: ProgressDbOpenOptions): IDBFactory | null {
  if (options.indexedDB === null) return null;
  if (options.indexedDB !== undefined) return options.indexedDB;
  const candidate = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  return candidate ?? null;
}

/**
 * Abre (ou cria) o banco de progresso.
 *
 * `onblocked` rejeita com `ProgressDbUnavailableError` em vez de pendurar para
 * sempre: outra aba com versão antiga aberta é um estado recuperável, não um
 * travamento silencioso.
 */
export function openProgressDb(options: ProgressDbOpenOptions = {}): Promise<ProgressDatabase> {
  const factory = resolveFactory(options);
  if (!factory) return Promise.reject(new ProgressDbUnavailableError());

  const name = options.name ?? PROGRESS_DB_NAME;
  const version = options.version ?? PROGRESS_DB_VERSION;

  return new Promise<ProgressDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, version);
    } catch (error) {
      reject(new ProgressDbUnavailableError(describeCause(error)));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      ensureSchema(db);
    };
    request.onerror = () =>
      reject(
        new ProgressDbUnavailableError(
          `não foi possível abrir "${name}": ${describeCause(request.error)}`,
        ),
      );
    request.onblocked = () =>
      reject(
        new ProgressDbUnavailableError(
          `abertura de "${name}" bloqueada por outra conexão com versão anterior`,
        ),
      );
    request.onsuccess = () => {
      resolve(new ProgressDatabase(request.result));
    };
  });
}

/**
 * Variante tolerante: devolve `null` quando IndexedDB não está disponível.
 * A Fase 4 usa isto para mostrar estado degradado em vez de quebrar a tela.
 */
export async function tryOpenProgressDb(
  options: ProgressDbOpenOptions = {},
): Promise<ProgressDatabase | null> {
  try {
    return await openProgressDb(options);
  } catch (error) {
    if (error instanceof ProgressDbUnavailableError) return null;
    throw error;
  }
}

/** `true` quando há uma fábrica de IndexedDB utilizável. */
export function isProgressDbAvailable(indexedDB?: IDBFactory | null): boolean {
  const candidate =
    indexedDB === undefined ? (globalThis as { indexedDB?: IDBFactory }).indexedDB : indexedDB;
  return candidate !== null && candidate !== undefined;
}

/**
 * Apaga o banco inteiro. Uso restrito a testes/“apagar tudo” explícito do aluno
 * — nunca chamado automaticamente por migração ou importação.
 */
export function deleteProgressDb(
  options: Pick<ProgressDbOpenOptions, "name" | "indexedDB"> = {},
): Promise<void> {
  const factory = resolveFactory(options);
  if (!factory) return Promise.resolve();
  const name = options.name ?? PROGRESS_DB_NAME;
  return new Promise<void>((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(new ProgressTransactionError([], request.error, `falha ao apagar o banco "${name}"`));
    request.onblocked = () => resolve();
  });
}
