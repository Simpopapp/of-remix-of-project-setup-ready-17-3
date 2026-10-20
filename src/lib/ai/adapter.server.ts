/**
 * Adaptador de avaliação — orquestra limites, cache, retry restrito, schema,
 * leak-guard e rastreio estrutural. É o único caminho pelo qual a Fase 5 (e o
 * runner de calibração da Fase 5/s4) chama o modelo.
 *
 * Regras de honestidade (PRD s1 §1.7–§1.11):
 * - Falha de qualquer natureza vira `needs_review` ou `abstained` com `score: null`.
 * - Só 429 e 5xx são retentáveis (no máximo 2 tentativas extras, backoff
 *   exponencial + jitter, honrando `Retry-After`).
 * - Nada de timeout/abort artificial. Abort do cliente vira abstenção.
 * - A chave nunca é lida aqui em escopo de módulo: o `callModel` de produção a lê
 *   dentro do handler e lança `MissingApiKeyError` quando ausente.
 * - Nenhum log contém resposta, questão, gabarito ou feedback.
 *
 * Server-only: o nome `.server.ts` impede que este módulo entre no bundle cliente.
 */

import { parseEvaluationResult, type EvaluationResult } from "@/domain";
import { examTaskSpecFor } from "@/lib/app/practice-timer";

import {
  QUESTION_ID_PATTERN,
  MAX_QUESTION_ID_LENGTH,
  MAX_RESPONSE_FIELD_LENGTH,
  EVALUATION_MODES,
  DEFAULT_EVALUATION_MODEL,
  responseTextOf,
  type EvaluationRequestPayload,
} from "./evaluation-io";
import { EvaluationOutputError, MissingApiKeyError, errorCodeOf } from "./errors";
import { sanitizeEvaluationResult } from "./leak-guard";
import type { UntrustedPart } from "./reference";
import { abstainedResult, needsReviewResult, type EvaluationIdentity } from "./result-builders";

export { DEFAULT_EVALUATION_MODEL };

export const CACHE_TTL_MS = 10 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 100;
const MAX_EXTRA_ATTEMPTS = 2;
const BASE_BACKOFF_MS = 500;

export interface EvaluateInput extends EvaluationRequestPayload {
  /** System prompt composto (política do juiz + rubrica do tipo). */
  systemPrompt: string;
  /** Conteúdo não confiável (enunciado, opções e resposta), já rotulado. */
  untrusted: UntrustedPart[];
  rubricVersion: string;
  promptVersion: string;
  /** Trechos reservados que o leak-guard deve impedir de sair na resposta. */
  referenceSamples: string[];
  /** Modelo configurável por implantação. */
  model?: string;
  /** Abort do cliente, propagado ao modelo. */
  signal?: AbortSignal;
}

export interface EvaluatorModelCall {
  call(input: {
    systemPrompt: string;
    untrusted: UntrustedPart[];
    rubricVersion: string;
    promptVersion: string;
    model?: string;
    signal?: AbortSignal;
  }): Promise<EvaluationResult>;
}

export interface EvaluationLogEntry {
  kind: "evaluation";
  type: string;
  questionId: string;
  model: string;
  attempt: number;
  outcome: "scored" | "abstained" | "needs_review" | "retry" | "cache_hit" | "invalid_input";
  durationMs: number;
  errorKind?: string;
}

export interface AdapterDependencies {
  /** Em produção: chamada real ao gateway. Nos testes: fake injetado. */
  callModel: EvaluatorModelCall["call"];
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Injetável para backoff determinístico nos testes. */
  random?: () => number;
  log?: (entry: EvaluationLogEntry) => void;
  model?: string;
}

export interface EvaluationAdapter {
  evaluate(input: EvaluateInput): Promise<EvaluationResult>;
}

type ModelIdentity = EvaluationIdentity;

interface InputValidation {
  ok: boolean;
  reason?: string;
}

function textField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Validação de limites em runtime (o zod do wrapper é a primeira barreira; esta é
 * a segunda, para chamadas internas como o runner de calibração).
 */
export function validateEvaluationInput(input: EvaluationRequestPayload): InputValidation {
  if (examTaskSpecFor(input.type) === null) {
    return { ok: false, reason: "tipo de tarefa desconhecido" };
  }
  if (
    typeof input.questionId !== "string" ||
    input.questionId.length < 1 ||
    input.questionId.length > MAX_QUESTION_ID_LENGTH ||
    !QUESTION_ID_PATTERN.test(input.questionId)
  ) {
    return { ok: false, reason: "identificador de questão inválido" };
  }
  if (!(EVALUATION_MODES as readonly string[]).includes(input.mode)) {
    return { ok: false, reason: "modo de avaliação inválido" };
  }
  if (typeof input.response !== "object" || input.response === null) {
    return { ok: false, reason: "resposta ausente" };
  }
  const text = textField(input.response.text);
  const transcript = textField(input.response.transcript);
  if (input.response.text !== undefined && text === undefined) {
    return { ok: false, reason: "campo de texto inválido" };
  }
  if (input.response.transcript !== undefined && transcript === undefined) {
    return { ok: false, reason: "campo de transcrição inválido" };
  }
  for (const value of [text, transcript]) {
    if (value !== undefined && value.length > MAX_RESPONSE_FIELD_LENGTH) {
      return { ok: false, reason: "resposta acima do limite de tamanho" };
    }
  }
  if (!responseTextOf(input.response).trim()) {
    return { ok: false, reason: "resposta vazia" };
  }
  return { ok: true };
}

function identityOf(input: EvaluateInput, fallbackModel: string): ModelIdentity {
  return {
    model: input.model?.trim() || fallbackModel,
    promptVersion: input.promptVersion.trim() || "unknown",
    rubricVersion: input.rubricVersion.trim() || "unknown",
  };
}

function statusCodeOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as {
    statusCode?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const values = [candidate.statusCode, candidate.status, candidate.response?.status];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function retryAfterMsOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as {
    responseHeaders?: Record<string, string>;
    retryAfter?: unknown;
    data?: { retry_after_seconds?: unknown; retryAfterSeconds?: unknown };
  };
  const headers = candidate.responseHeaders ?? {};
  const headerKey = Object.keys(headers).find((key) => key.toLowerCase() === "retry-after");
  const headerValue = headerKey === undefined ? undefined : headers[headerKey];
  if (typeof headerValue === "string") {
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const parsedDate = Date.parse(headerValue);
    if (Number.isFinite(parsedDate)) return Math.max(0, parsedDate - Date.now());
  }
  for (const value of [
    candidate.retryAfter,
    candidate.data?.retry_after_seconds,
    candidate.data?.retryAfterSeconds,
  ]) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value * 1000;
  }
  return undefined;
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function classify(error: unknown): { retryable: boolean; code: string } {
  const status = statusCodeOf(error);
  if (status !== undefined) {
    if (status === 429) return { retryable: true, code: "rate_limited" };
    if (status >= 500 && status <= 599) return { retryable: true, code: "server_error" };
    if (status === 401) return { retryable: false, code: "unauthorized" };
    if (status === 402 || status === 403) return { retryable: false, code: "forbidden" };
    if (status === 404) return { retryable: false, code: "not_found" };
    if (status === 400) return { retryable: false, code: "bad_request" };
    return { retryable: false, code: "unknown" };
  }
  const code = errorCodeOf(error);
  if (code !== undefined && !["rate_limited", "server_error", "unknown"].includes(code)) {
    return { retryable: false, code };
  }
  if (error instanceof MissingApiKeyError) return { retryable: false, code: "missing_api_key" };
  if (error instanceof EvaluationOutputError) return { retryable: false, code: "schema" };
  if (error instanceof TypeError) return { retryable: false, code: "network" };
  return { retryable: false, code: code ?? "unknown" };
}

function failureResult(
  error: unknown,
  identity: ModelIdentity,
  nowMs: number,
  signal: AbortSignal | undefined,
): { result: EvaluationResult; code: string } {
  if (isAbort(error, signal)) {
    return {
      result: abstainedResult(identity, nowMs, "avaliação cancelada", "A avaliação foi cancelada."),
      code: "aborted",
    };
  }
  const { code } = classify(error);

  switch (code) {
    case "missing_api_key":
      return {
        result: needsReviewResult(
          identity,
          nowMs,
          "serviço de IA não configurado neste ambiente",
          "A avaliação por IA não está configurada neste ambiente.",
        ),
        code,
      };
    case "schema":
      return {
        result: needsReviewResult(
          identity,
          nowMs,
          "o avaliador devolveu um resultado fora do contrato",
          "O avaliador não produziu um resultado válido; tente novamente.",
        ),
        code,
      };
    case "unauthorized":
      return {
        result: needsReviewResult(
          identity,
          nowMs,
          "serviço de IA indisponível no momento",
          "A avaliação por IA está indisponível no momento.",
        ),
        code,
      };
    case "forbidden":
      return {
        result: needsReviewResult(
          identity,
          nowMs,
          "avaliação por IA indisponível para esta implantação",
          "A avaliação por IA não está disponível para esta implantação.",
        ),
        code,
      };
    case "not_found":
      return {
        result: abstainedResult(
          identity,
          nowMs,
          "avaliador não disponível neste ambiente",
          "O avaliador deste tipo de tarefa não está disponível.",
        ),
        code,
      };
    case "bad_request":
      return {
        result: needsReviewResult(
          identity,
          nowMs,
          "a entrada não pôde ser avaliada pelo serviço",
          "Não foi possível avaliar esta resposta com a entrada enviada.",
        ),
        code,
      };
    case "rate_limited":
      return {
        result: needsReviewResult(
          identity,
          nowMs,
          "serviço de IA ocupado; tente novamente em instantes",
          "O serviço de avaliação está ocupado. Tente novamente em instantes.",
        ),
        code,
      };
    case "server_error":
      return {
        result: needsReviewResult(
          identity,
          nowMs,
          "serviço de IA instável; tente novamente em instantes",
          "O serviço de avaliação está instável. Tente novamente em instantes.",
        ),
        code,
      };
    case "network":
      return {
        result: needsReviewResult(
          identity,
          nowMs,
          "não foi possível conectar ao serviço de avaliação",
          "Sem conexão com o serviço de avaliação. Verifique sua rede e tente novamente.",
        ),
        code,
      };
    default:
      return {
        result: needsReviewResult(
          identity,
          nowMs,
          "não foi possível concluir a avaliação",
          "A avaliação não pôde ser concluída; tente novamente.",
        ),
        code: "unknown",
      };
  }
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function hashResponse(response: EvaluationRequestPayload["response"]): Promise<string> {
  const raw = `${response.text ?? ""}\u0000${response.transcript ?? ""}`;
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  return fnv1a(raw);
}

function backoffMs(attempt: number, random: () => number): number {
  const exponential = BASE_BACKOFF_MS * 2 ** attempt;
  const jitter = Math.floor(random() * BASE_BACKOFF_MS);
  return exponential + jitter;
}

const defaultLog = (entry: EvaluationLogEntry): void => {
  // Estrutural por contrato: nenhum texto de resposta/questão/gabarito.
  console.info("[ai:evaluation]", entry);
};

/**
 * Cria um adaptador com dependências injetáveis. Em produção, `callModel` é a
 * chamada real ao gateway; em testes, um fake controla retry/cache/schema.
 */
export function createEvaluationAdapter(deps: AdapterDependencies): EvaluationAdapter {
  const nowMs = deps.nowMs ?? (() => Date.now());
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms)));
  const random = deps.random ?? Math.random;
  const log = deps.log ?? defaultLog;
  const defaultModel = deps.model ?? DEFAULT_EVALUATION_MODEL;
  const cache = new Map<string, { at: number; result: EvaluationResult }>();

  return {
    async evaluate(input) {
      const startedAt = nowMs();
      const identity = identityOf(input, defaultModel);

      const validation = validateEvaluationInput(input);
      if (!validation.ok) {
        log({
          kind: "evaluation",
          type: String(input.type),
          questionId: String(input.questionId),
          model: identity.model,
          attempt: 0,
          outcome: "invalid_input",
          durationMs: nowMs() - startedAt,
          errorKind: "invalid_input",
        });
        return abstainedResult(
          identity,
          nowMs(),
          validation.reason ?? "entrada inválida/expirou",
          "A resposta não pôde ser avaliada porque a entrada é inválida ou expirou.",
        );
      }

      const responseHash = await hashResponse(input.response);
      const cacheKey = [
        input.type,
        input.questionId,
        responseHash,
        identity.promptVersion,
        identity.rubricVersion,
        identity.model,
      ].join("|");
      const cached = cache.get(cacheKey);
      if (cached !== undefined) {
        if (nowMs() - cached.at < CACHE_TTL_MS) {
          log({
            kind: "evaluation",
            type: input.type,
            questionId: input.questionId,
            model: identity.model,
            attempt: 0,
            outcome: "cache_hit",
            durationMs: nowMs() - startedAt,
          });
          return cached.result;
        }
        cache.delete(cacheKey);
      }

      let attempt = 0;
      for (;;) {
        try {
          const raw = await deps.callModel({
            systemPrompt: input.systemPrompt,
            untrusted: input.untrusted,
            rubricVersion: identity.rubricVersion,
            promptVersion: identity.promptVersion,
            model: identity.model,
            ...(input.signal ? { signal: input.signal } : {}),
          });

          let parsed: EvaluationResult;
          try {
            // Identidade e instante são carimbados pelo servidor: o modelo não
            // controla quem avaliou nem quando.
            parsed = parseEvaluationResult({
              ...raw,
              evaluator: identity,
              scoredAt: new Date(nowMs()).toISOString(),
            });
          } catch {
            throw new EvaluationOutputError();
          }

          const safe = sanitizeEvaluationResult(parsed, input.referenceSamples);
          if (cache.size >= CACHE_MAX_ENTRIES) {
            const oldestKey = cache.keys().next().value;
            if (typeof oldestKey === "string") cache.delete(oldestKey);
          }
          cache.set(cacheKey, { at: nowMs(), result: safe });

          log({
            kind: "evaluation",
            type: input.type,
            questionId: input.questionId,
            model: identity.model,
            attempt,
            outcome: safe.verdict,
            durationMs: nowMs() - startedAt,
          });
          return safe;
        } catch (error) {
          const { retryable, code } = classify(error);
          if (retryable && attempt < MAX_EXTRA_ATTEMPTS) {
            const waitMs = retryAfterMsOf(error) ?? backoffMs(attempt, random);
            log({
              kind: "evaluation",
              type: input.type,
              questionId: input.questionId,
              model: identity.model,
              attempt,
              outcome: "retry",
              durationMs: nowMs() - startedAt,
              errorKind: code,
            });
            attempt += 1;
            await sleep(waitMs);
            continue;
          }

          const { result, code: failureCode } = failureResult(
            error,
            identity,
            nowMs(),
            input.signal,
          );
          log({
            kind: "evaluation",
            type: input.type,
            questionId: input.questionId,
            model: identity.model,
            attempt,
            outcome: result.verdict,
            durationMs: nowMs() - startedAt,
            errorKind: failureCode,
          });
          return result;
        }
      }
    },
  };
}
