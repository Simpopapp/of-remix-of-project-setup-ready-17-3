/**
 * Superfície RPC da avaliação por IA — segura para importar no cliente.
 *
 * O cliente envia apenas `{ type, questionId, response, mode }`. O carregamento da
 * questão, a referência reservada e a chave do gateway ficam no módulo
 * `.server.ts`, importado dinamicamente DENTRO do handler (nunca no bundle cliente).
 *
 * Entrada inválida vira abstenção com `score: null` — nunca um erro cru de
 * validação e nunca uma nota substituta.
 */

import { createServerFn } from "@tanstack/react-start";

import {
  DEFAULT_EVALUATION_MODEL,
  INVALID_INPUT_REASON,
  RUBRIC_UNAVAILABLE_VERSION,
  parseEvaluationRequest,
  type EvaluationRequestPayload,
  type EvaluationResponse,
} from "./evaluation-io";
import { JUDGE_PROMPT_VERSION } from "./judge-policy";
import { abstainedResult } from "./result-builders";

function invalidInputResult(): EvaluationResponse {
  return {
    evaluation: abstainedResult(
      {
        model: DEFAULT_EVALUATION_MODEL,
        promptVersion: JUDGE_PROMPT_VERSION,
        rubricVersion: RUBRIC_UNAVAILABLE_VERSION,
      },
      Date.now(),
      INVALID_INPUT_REASON,
      "A resposta não pôde ser avaliada porque a entrada é inválida ou expirou.",
    ),
  };
}

type ValidatedInput = { valid: true; data: EvaluationRequestPayload } | { valid: false };

export const evaluateResponseFunction = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): ValidatedInput => {
    const parsed = parseEvaluationRequest(raw);
    return parsed.ok ? { valid: true, data: parsed.data } : { valid: false };
  })
  .handler(async ({ data }): Promise<EvaluationResponse> => {
    if (!data.valid) return invalidInputResult();
    const { evaluateResponse } = await import("./evaluate.server");
    return evaluateResponse(data.data);
  });
