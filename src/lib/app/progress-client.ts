/**
 * Cliente do progresso local — uma conexão para todo o app (Fase 4, onda 0).
 *
 * Problema que resolve: `openProgressLayer()` abre IndexedDB e monta store,
 * backup e mídia. Se cada componente abrisse a sua conexão, teríamos N conexões,
 * N caches e risco de `onblocked` entre abas. Este módulo é o singleton
 * browser-only que a UI consome.
 *
 * Regras (PRD central §4.5 e §10):
 * - O progresso é 100% local e só existe no navegador. Em SSR não há IndexedDB:
 *   `getProgressLayer()` rejeita com erro claro e `isProgressAvailable()` é
 *   `false`. Componentes só chamam dentro de `useEffect`/eventos.
 * - A Promise é a MESMA para todos os chamadores (evita corrida de abertura).
 * - Falha não envenena o singleton: a próxima chamada tenta de novo.
 * - Sem IndexedDB (navegador restrito), a UI degrada — nunca quebra a tela.
 *
 * `configureProgressClient` existe para testes (injeção de `fake-indexeddb` ou
 * `null` para simular indisponibilidade) e para uma futura troca de nome do
 * banco por implantação. Em produção nunca é chamado.
 */

import {
  ProgressDbUnavailableError,
  openProgressLayer,
  type OpenProgressLayerOptions,
  type ProgressLayer,
} from "./index";

export interface ProgressClientConfig {
  /** nome do banco; ausente = `PROGRESS_DB_NAME` da Fase 3 */
  dbName?: string;
  /** fábrica injetável; `null` força indisponibilidade */
  indexedDB?: IDBFactory | null;
}

let config: ProgressClientConfig = {};
let layerPromise: Promise<ProgressLayer> | null = null;
let resolvedLayer: ProgressLayer | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Há como abrir o progresso agora?
 *
 * `false` em SSR, quando não existe `indexedDB` global ou quando o cliente foi
 * configurado explicitamente como indisponível (`indexedDB: null`).
 */
export function isProgressAvailable(): boolean {
  if (!isBrowser()) return false;
  if (config.indexedDB === null) return false;
  if (config.indexedDB !== undefined) return true;
  return typeof globalThis.indexedDB !== "undefined";
}

/**
 * Abre (ou reaproveita) a conexão única do progresso.
 *
 * Rejeita com `ProgressDbUnavailableError` em SSR e quando o navegador não tem
 * IndexedDB — os consumidores tratam como estado degradado, não como crash.
 */
export function getProgressLayer(): Promise<ProgressLayer> {
  if (!isBrowser()) {
    return Promise.reject(
      new ProgressDbUnavailableError(
        "progresso local indisponível no servidor: abra dentro de useEffect/evento",
      ),
    );
  }
  if (layerPromise !== null) return layerPromise;
  if (!isProgressAvailable()) {
    return Promise.reject(
      new ProgressDbUnavailableError(
        "IndexedDB não está disponível neste navegador; o progresso não será gravado",
      ),
    );
  }

  const options: OpenProgressLayerOptions = {};
  if (config.dbName !== undefined) options.dbName = config.dbName;
  if (config.indexedDB !== undefined) options.indexedDB = config.indexedDB;

  const pending: Promise<ProgressLayer> = openProgressLayer(options)
    .then((layer) => {
      resolvedLayer = layer;
      return layer;
    })
    .catch((error: unknown) => {
      // Não envenena o singleton: uma nova tentativa pode dar certo.
      if (layerPromise === pending) layerPromise = null;
      throw error;
    });

  layerPromise = pending;
  return pending;
}

/**
 * Acesso síncrono à camada já aberta (para handlers que não podem esperar).
 * `null` antes da primeira abertura bem-sucedida.
 */
export function peekProgressLayer(): ProgressLayer | null {
  return resolvedLayer;
}

/**
 * Fecha e esquece a conexão. Usado por testes e por um eventual "apagar tudo"
 * explícito do aluno; nenhuma migração chama isto sozinha.
 */
export async function closeProgressLayer(): Promise<void> {
  const pending = layerPromise;
  layerPromise = null;
  resolvedLayer = null;
  if (pending === null) return;
  try {
    const layer = await pending;
    layer.close();
  } catch {
    // Já estava indisponível: não há o que fechar.
  }
}

/** Reconfigura o cliente (testes/injeção). Fecha a conexão anterior se houver. */
export function configureProgressClient(next: ProgressClientConfig = {}): void {
  void closeProgressLayer();
  config = { ...next };
}

/** Volta ao estado inicial (somente testes). */
export function resetProgressClient(): void {
  void closeProgressLayer();
  config = {};
}
