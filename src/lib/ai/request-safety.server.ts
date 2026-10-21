/**
 * Guarda server-only da avaliação — consentimento estrito + limite por instância.
 *
 * Ordem do fluxo (proposital): parse do envelope → consentimento → lease de
 * concorrência/limite → só então carregar o avaliador (`loadEvaluator`). Um pedido
 * sem consentimento ou acima do limite retorna abstenção com `score: null` sem
 * importar o gateway e sem gastar chamada paga.
 *
 * Limites reais desta proteção (honestidade, não marketing):
 * - O contador é em memória e POR INSTÂNCIA. Restarts, múltiplas instâncias ou
 *   distribuição geográfica não compartilham estado — não existe teto financeiro
 *   global. Ela reduz abuso casual e impede rajadas acidentais da UI.
 * - Não há identidade de cliente confiável (produto individual, sem contas): o
 *   limite é global por instância, nunca por IP ou header (que seriam falsificáveis).
 * - O limiter não guarda payload, resposta, chave nem referência — só contadores.
 *   A liberação do lease acontece em `finally`, inclusive quando o avaliador lança.
 * - O sinal de consentimento é uma declaração do cliente, não autenticação.
 */

import {
  DEFAULT_EVALUATION_MODEL,
  INVALID_INPUT_REASON,
  RUBRIC_UNAVAILABLE_VERSION,
  type EvaluationRequestPayload,
  type EvaluationResponse,
} from "./evaluation-io";
import { JUDGE_PROMPT_VERSION } from "./judge-policy";
import { parseEvaluationEnvelope } from "./request-safety";
import { abstainedResult } from "./result-builders";

/* ------------------------------------------------------------------ */
/* Política padrão                                                     */
/* ------------------------------------------------------------------ */

/**
 * Política conservadora para um app individual sem contas: 10 avaliações por
 * minuto por instância e no máximo 2 em voo (o gateway é o gargalo caro).
 */
export const EVALUATION_RATE_LIMIT = Object.freeze({
  maxRequests: 10,
  windowMs: 60_000,
  maxConcurrent: 2,
});

export interface EvaluationRateLimitPolicy {
  maxRequests: number;
  windowMs: number;
  maxConcurrent: number;
}

/* ------------------------------------------------------------------ */
/* Limiter                                                             */
/* ------------------------------------------------------------------ */

export type AcquireResult =
  | { ok: true; release: () => void }
  | { ok: false; reason: "busy"; retryAfterMs: number }
  | { ok: false; reason: "rate_limited"; retryAfterMs: number };

export interface LimiterSnapshot {
  inFlight: number;
  usedInWindow: number;
  windowResetAt: number | null;
}

export interface EvaluationLimiter {
  acquire: () => AcquireResult;
  /** Somente leitura para observabilidade/testes: nunca expõe payload ou resposta. */
  snapshot: () => LimiterSnapshot;
}

export interface EvaluationLimiterOptions {
  maxRequests?: number;
  windowMs?: number;
  maxConcurrent?: number;
  nowMs?: () => number;
}

function positiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const floored = Math.floor(value);
  return floored >= 1 ? floored : fallback;
}

function normalizePolicy(options: EvaluationLimiterOptions): EvaluationRateLimitPolicy {
  return {
    maxRequests: positiveInt(options.maxRequests, EVALUATION_RATE_LIMIT.maxRequests),
    windowMs: positiveInt(options.windowMs, EVALUATION_RATE_LIMIT.windowMs),
    maxConcurrent: positiveInt(options.maxConcurrent, EVALUATION_RATE_LIMIT.maxConcurrent),
  };
}

/**
 * Cria um limiter independente. `nowMs` é injetável para testar expiração de
 * janela sem esperar tempo real.
 */
export function createEvaluationLimiter(options: EvaluationLimiterOptions = {}): EvaluationLimiter {
  const policy = normalizePolicy(options);
  const nowMs = options.nowMs ?? (() => Date.now());

  let windowStartMs: number | null = null;
  let usedInWindow = 0;
  let inFlight = 0;

  function rollWindow(now: number): number {
    if (windowStartMs === null || now - windowStartMs >= policy.windowMs) {
      windowStartMs = now;
      usedInWindow = 0;
    }
    return windowStartMs ?? now;
  }

  return {
    acquire() {
      const now = nowMs();
      const start = rollWindow(now);

      // Concorrência primeiro: pedido que não pode rodar agora não consome cota.
      if (inFlight >= policy.maxConcurrent) {
        return { ok: false, reason: "busy", retryAfterMs: 0 };
      }
      if (usedInWindow >= policy.maxRequests) {
        return {
          ok: false,
          reason: "rate_limited",
          retryAfterMs: Math.max(0, start + policy.windowMs - now),
        };
      }

      usedInWindow += 1;
      inFlight += 1;

      let released = false;
      return {
        ok: true,
        release() {
          if (released) return;
          released = true;
          inFlight = Math.max(0, inFlight - 1);
        },
      };
    },
    snapshot() {
      return {
        inFlight,
        usedInWindow,
        windowResetAt: windowStartMs === null ? null : windowStartMs + policy.windowMs,
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Guarda                                                              */
/* ------------------------------------------------------------------ */

/** Motivos de abstenção devolvidos ao aluno/UI (pt-BR vai em `feedback`). */
export const CONSENT_REQUIRED_REASON = "consentimento de avaliação ausente ou inválido";
export const RATE_LIMITED_REASON = "limite de avaliações desta instância atingido";
export const BUSY_REASON = "outra avaliação simultânea em andamento nesta instância";

export type EvaluateResponseFn = (payload: EvaluationRequestPayload) => Promise<EvaluationResponse>;

export interface GuardedEvaluationDependencies {
  limiter: EvaluationLimiter;
  /** Importa/constrói o avaliador só DEPOIS de consentimento e lease. */
  loadEvaluator: () => Promise<EvaluateResponseFn>;
  nowMs?: () => number;
}

export type GuardedEvaluation = (raw: unknown) => Promise<EvaluationResponse>;

function blockedResult(reason: string, feedback: string, nowMs: number): EvaluationResponse {
  return {
    evaluation: abstainedResult(
      {
        model: DEFAULT_EVALUATION_MODEL,
        promptVersion: JUDGE_PROMPT_VERSION,
        rubricVersion: RUBRIC_UNAVAILABLE_VERSION,
      },
      nowMs,
      reason,
      feedback,
    ),
  };
}

/**
 * Cria a função de avaliação com consentimento e limite. Testável sem
 * `createServerFn` e sem rede.
 *
 * Em erro do avaliador a exceção é propagada (a porta do cliente transforma em
 * `service_error`), mas o lease é sempre liberado antes.
 */
export function createGuardedEvaluation(deps: GuardedEvaluationDependencies): GuardedEvaluation {
  const nowMs = deps.nowMs ?? (() => Date.now());

  return async function guarded(raw: unknown) {
    const parsed = parseEvaluationEnvelope(raw);
    if (!parsed.ok) {
      if (parsed.reason === "consent_required") {
        return blockedResult(
          CONSENT_REQUIRED_REASON,
          "A avaliação não foi enviada: o consentimento de envio não está ativo. Nada foi pontuado.",
          nowMs(),
        );
      }
      return blockedResult(
        INVALID_INPUT_REASON,
        "A resposta não pôde ser avaliada porque a entrada é inválida ou expirou.",
        nowMs(),
      );
    }

    const lease = deps.limiter.acquire();
    if (!lease.ok) {
      if (lease.reason === "busy") {
        return blockedResult(
          BUSY_REASON,
          "Outra avaliação já está em andamento nesta instância. Nada foi pontuado; tente de novo em instantes.",
          nowMs(),
        );
      }
      return blockedResult(
        RATE_LIMITED_REASON,
        "O limite de avaliações desta instância foi atingido. Nada foi pontuado; tente de novo em instantes.",
        nowMs(),
      );
    }

    try {
      const evaluate = await deps.loadEvaluator();
      return await evaluate(parsed.data);
    } finally {
      lease.release();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Composição padrão do endpoint                                       */
/* ------------------------------------------------------------------ */

/** Limiter global da instância (em memória; ver limitações no topo). */
export const evaluationLimiter = createEvaluationLimiter();

/**
 * Entrada do endpoint público. O avaliador real só é importado depois da
 * validação de consentimento e da aquisição do lease.
 */
export const evaluateGuarded: GuardedEvaluation = createGuardedEvaluation({
  limiter: evaluationLimiter,
  loadEvaluator: async () => {
    const { evaluateResponse } = await import("./evaluate.server");
    return evaluateResponse;
  },
});
