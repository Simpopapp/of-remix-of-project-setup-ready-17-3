/**
 * Envelope de avaliação com consentimento explícito — seguro para importar no cliente.
 *
 * Por que este módulo existe (Fase 5 — s8): o consentimento de envio não pode ser
 * só uma decisão de UI. O servidor precisa receber um sinal explícito e rejeitar
 * qualquer pedido sem ele ANTES de carregar o avaliador (que custa dinheiro).
 *
 * Escolha de formato (único, sem variantes): o payload de domínio é mantido
 * intacto e o sinal viaja como uma chave extra no topo — `{ ...payload, consent: true }`.
 * O consentimento NUNCA entra em `EvaluationRequestPayload`, porque esse contrato é
 * compartilhado com o runner de calibração e com o adaptador (que não têm UI nem
 * consentimento). `parseEvaluationEnvelope` remove a chave antes de devolver o
 * payload validado, então nada a jusante vê o campo.
 *
 * Limite honesto: o sinal é uma DECLARAÇÃO do cliente, não autenticação nem prova
 * de identidade. Ele impede envio acidental/sem opt-in e reduz abuso casual, mas
 * não substitui controle de acesso — o produto é individual, sem contas.
 */

import { parseEvaluationRequest, type EvaluationRequestPayload } from "./evaluation-io";

/** Chave única do sinal de consentimento. */
export const EVALUATION_CONSENT_KEY = "consent" as const;

/** Payload de domínio + declaração explícita de consentimento. */
export type EvaluationRequestEnvelope = EvaluationRequestPayload & { consent: true };

/**
 * Motivos de rejeição do envelope. São códigos internos; a UI recebe uma
 * abstenção com texto em pt-BR, nunca um erro cru.
 */
export type EnvelopeRejectionReason = "consent_required" | "invalid_payload";

export type EnvelopeParseResult =
  { ok: true; data: EvaluationRequestPayload } | { ok: false; reason: EnvelopeRejectionReason };

/** Monta o envelope que o cliente envia. Cópia nova: nunca muta o payload recebido. */
export function withEvaluationConsent(
  payload: EvaluationRequestPayload,
): EvaluationRequestEnvelope {
  return { ...payload, consent: true };
}

/**
 * Valida o envelope no servidor.
 *
 * Regras, nesta ordem:
 * 1. O corpo precisa ser um objeto simples.
 * 2. `consent` precisa ser EXATAMENTE `true` (booleano). `false`, `"true"`, `1`
 *    ou ausente invalidam — não há coerção.
 * 3. O restante precisa passar no schema estrito de `EvaluationRequestPayload`;
 *    chaves desconhecidas são rejeitadas (nada de settings/progresso no corpo).
 *
 * O retorno em sucesso é o payload de domínio sem a chave `consent`.
 */
export function parseEvaluationEnvelope(raw: unknown): EnvelopeParseResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "invalid_payload" };
  }

  const record = raw as Record<string, unknown>;
  if (record[EVALUATION_CONSENT_KEY] !== true) {
    return { ok: false, reason: "consent_required" };
  }

  const payload: Record<string, unknown> = { ...record };
  delete payload[EVALUATION_CONSENT_KEY];
  const parsed = parseEvaluationRequest(payload);
  if (!parsed.ok) return { ok: false, reason: "invalid_payload" };

  return { ok: true, data: parsed.data };
}
