/**
 * Chamada OpenAI Responses através do Lovable AI Gateway.
 *
 * Base: `/tmp/knowledge/skill/ai-apps-openai-responses/examples/responses.ts`,
 * adaptada ao runtime TanStack Start:
 * - imports locais (`./run-id.ts`) em vez do caminho da skill;
 * - provider criado DENTRO de cada request (nunca em escopo de módulo);
 * - as cinco opções de provider exigidas pela política do gateway em toda chamada
 *   (`store: false`, `forceReasoning`, `reasoningEffort`, `reasoningSummary`,
 *   `include: ["reasoning.encrypted_content"]`).
 *
 * O arquivo é server-only por contrato de uso: recebe `apiKey` e nunca deve ser
 * importado por código que roda no navegador.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.ts";

export interface ResponsesGatewayConfig {
  /** URL do gateway (com ou sem `/v1`). */
  baseURL: string;
  apiKey: string;
  model: string;
  /** AbortSignal do cliente, propagado sem timeouts artificiais. */
  signal?: AbortSignal | undefined;
  /** Run ID recebido da plataforma, quando existir. */
  runId?: string | undefined;
}

/** Provider + captura de run ID criados por request (nunca reaproveitados). */
export function createResponsesGateway(config: ResponsesGatewayConfig) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(config.runId);
  const provider = createOpenAI({
    baseURL: `${config.baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`,
    apiKey: config.apiKey,
    headers: { "Lovable-API-Key": config.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  return { provider, runIdFetch };
}

/**
 * Opções de provider aplicadas a TODA chamada de avaliação. As cinco linhas são
 * obrigatórias: omitir uma altera o comportamento do gateway silenciosamente.
 */
export function evaluationProviderOptions() {
  return {
    openai: {
      store: false,
      forceReasoning: true,
      reasoningEffort: "medium",
      reasoningSummary: "auto",
      include: ["reasoning.encrypted_content"],
    },
  } as const;
}

/** Chamada de texto simples (sem structured output), preservada da referência. */
export function createResponsesCall(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string },
  messages: ModelMessage[],
  instructions?: string,
) {
  const { provider, runIdFetch } = createResponsesGateway({
    ...config,
    signal: request.signal,
    runId: getLovableAiGatewayRunId(request),
  });
  const result = streamText({
    model: provider.responses(config.model),
    ...(instructions ? { instructions } : {}),
    messages,
    abortSignal: request.signal,
    providerOptions: evaluationProviderOptions(),
  });
  return {
    result,
    response: () =>
      withLovableAiGatewayRunIdHeader(
        result.toUIMessageStreamResponse({ sendReasoning: true }),
        runIdFetch,
      ),
  };
}
