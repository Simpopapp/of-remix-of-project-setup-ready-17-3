/**
 * Helper oficial do provider Lovable AI Gateway (compatível com OpenAI).
 *
 * Copiado de `/tmp/knowledge/skill/ai-apps-gateway-sdk/examples/gateway-helpers.ts`
 * e ajustado apenas no import local do run ID. Este módulo é server-only no uso:
 * recebe a chave por argumento e nunca deve ser importado por código de cliente.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { createLovableAiGatewayRunIdFetch } from "./run-id.ts";

export {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  getLovableAiGatewayResponseHeaders,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.ts";

export function createLovableAiGatewayProvider(
  lovableApiKey: string,
  initialRunId: string | undefined,
  options: { baseURL: string; structuredOutputs?: boolean },
) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);

  const provider = createOpenAICompatible({
    name: "lovable",
    baseURL: `${options.baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`,
    supportsStructuredOutputs: options?.structuredOutputs ?? false,
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: runIdFetch.fetch,
  });

  return Object.assign(provider, {
    getRunId: runIdFetch.getRunId,
    waitForRunId: runIdFetch.waitForRunId,
  });
}
