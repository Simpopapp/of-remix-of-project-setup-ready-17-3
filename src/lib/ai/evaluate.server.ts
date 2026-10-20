/**
 * Composição server-only do avaliador.
 *
 * O adaptador (com cache em memória) é singleton de módulo. Nada de segredo é lido
 * em escopo de módulo: `LOVABLE_API_KEY` e URL do gateway são lidos dentro de cada
 * chamada, em `gateway/evaluate-call.server.ts`.
 */

import { loadQuestionsByType } from "@/data/loader";

import { createEvaluationAdapter } from "./adapter.server";
import { createEvaluationHandler } from "./evaluate-handler";
import type { EvaluationRequestPayload, EvaluationResponse } from "./evaluation-io";
import { createGatewayEvaluationCall } from "./gateway/evaluate-call.server";

const adapter = createEvaluationAdapter({
  callModel: createGatewayEvaluationCall({}),
});

export async function evaluateResponse(
  payload: EvaluationRequestPayload,
): Promise<EvaluationResponse> {
  const model = process.env["LOVABLE_AI_EVALUATION_MODEL"]?.trim();
  const handler = createEvaluationHandler({
    adapter,
    loadQuestionsByType,
    ...(model ? { model } : {}),
  });
  return handler(payload);
}
