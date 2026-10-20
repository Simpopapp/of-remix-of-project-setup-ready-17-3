/**
 * Porta de avaliação por IA — consentimento antes de qualquer envio (Fase 5 — s3).
 *
 * Por que este módulo existe: a avaliação é a única operação que tira a resposta
 * do aluno deste dispositivo. A regra do PRD central §4.5 é explícita — o
 * processamento externo é explicado antes do primeiro uso e o aluno pode estudar
 * sem enviar respostas. Concentrar o gate aqui garante que TODO motor de prática
 * (Fase 6 em diante) use a mesma decisão, em vez de cada tela inventar a sua.
 *
 * Garantias:
 * - Sem `aiConsent.evaluate`, `requestEvaluation` devolve `no_consent` e NÃO
 *   toca na rede nem importa a chave do gateway (a server function nem é chamada).
 * - Resposta vazia (só espaços, ou nenhum campo preenchido) devolve
 *   `empty_response` sem chamada — não gastamos avaliação nem geramos abstenção
 *   artificial para algo que o aluno ainda não escreveu.
 * - Falha do wrapper vira estado honesto (`service_error`, sem nota). O wrapper
 *   de s1 já devolve abstenção tipada; aqui só propagamos o resultado.
 * - Nada de validação duplicada: entrada inválida é rejeitada pelo zod da
 *   server function (`evaluation-io.ts`), que devolve abstenção tipada.
 */

import type { EvaluationResult } from "@/domain";
import { evaluateResponseFunction } from "@/lib/ai/evaluate.functions";
import { responseTextOf, type EvaluationRequestPayload } from "@/lib/ai/evaluation-io";

import type { AppSettings } from "./settings";

/* ------------------------------------------------------------------ */
/* Mensagens (pt-BR, sem promessa de nota oficial)                     */
/* ------------------------------------------------------------------ */

export const NO_CONSENT_MESSAGE = "Ative a avaliação por IA em Ajustes para enviar respostas.";
export const EMPTY_RESPONSE_MESSAGE =
  "Escreva ou grave sua resposta antes de enviar para avaliação.";
export const SERVICE_ERROR_MESSAGE =
  "Não foi possível avaliar agora. Nada foi pontuado — tente de novo quando a conexão voltar.";

/* ------------------------------------------------------------------ */
/* Gate                                                                */
/* ------------------------------------------------------------------ */

export type EvaluationGateReason = "no_consent" | "empty_response";

export type EvaluationGate =
  { ok: true } | { ok: false; reason: EvaluationGateReason; message: string };

/** Há conteúdo real na resposta? (texto e/ou transcrição, ignorando espaços) */
export function hasResponseContent(response: EvaluationRequestPayload["response"]): boolean {
  return responseTextOf(response).trim().length > 0;
}

/**
 * Decisão pura e síncrona: o envio pode acontecer?
 *
 * A ordem importa: consentimento é verificado primeiro, porque sem ele não há
 * envio — mesmo que a resposta esteja preenchida.
 */
export function canEvaluate(settings: AppSettings, hasResponse: boolean): EvaluationGate {
  if (settings.aiConsent?.evaluate !== true) {
    return { ok: false, reason: "no_consent", message: NO_CONSENT_MESSAGE };
  }
  if (!hasResponse) {
    return { ok: false, reason: "empty_response", message: EMPTY_RESPONSE_MESSAGE };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Chamada                                                             */
/* ------------------------------------------------------------------ */

/** Resultado da porta: sucesso com avaliação tipada, ou falha explicada. */
export type EvaluationRequestOutcome =
  { ok: true; evaluation: EvaluationResult } | { ok: false; reason: string; message: string };

/**
 * Pede a avaliação de UMA resposta.
 *
 * Só chega à server function quando há consentimento E resposta com conteúdo.
 * Erro de rede/serviço nunca vira nota: devolve falha explicada para a UI
 * mostrar e para o aluno tentar de novo.
 */
export async function requestEvaluation(
  settings: AppSettings,
  payload: EvaluationRequestPayload,
): Promise<EvaluationRequestOutcome> {
  const gate = canEvaluate(settings, hasResponseContent(payload.response));
  if (!gate.ok) return gate;

  try {
    const response = await evaluateResponseFunction({ data: payload });
    return { ok: true, evaluation: response.evaluation };
  } catch {
    // O detalhe técnico não interessa ao aluno; a UI mostra estado honesto.
    return { ok: false, reason: "service_error", message: SERVICE_ERROR_MESSAGE };
  }
}
