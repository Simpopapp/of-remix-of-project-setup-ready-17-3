/**
 * Chamada real ao Lovable AI Gateway (OpenAI Responses) — server-only.
 *
 * Responsabilidades:
 * - ler `LOVABLE_API_KEY` DENTRO do handler (nunca em escopo de módulo);
 * - criar provider por request, com as 5 opções obrigatórias de reasoning;
 * - usar structured output (`Output.object`) com schema pequeno/plano;
 * - carimbar identidade (`evaluator`) e `scoredAt` no servidor, sem confiar no
 *   modelo para esses campos;
 * - nunca retentar no SDK (o retry restrito é do adaptador) e nunca impor timeout.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";

import { ATTEMPT_SCORE_SCALE, type EvaluationResult } from "@/domain";

import { EvaluationOutputError, MissingApiKeyError } from "../errors";
import { buildEvaluatorMessages } from "../prompt-injection";
import { createLovableAiGatewayRunIdFetch } from "./run-id";

export const DEFAULT_GATEWAY_BASE_URL = "https://ai.gateway.lovable.dev/v1";

/**
 * Schema de saída do modelo. Sem `evaluator`/`scoredAt`: o servidor carimba.
 * Todos os campos são obrigatórios; opcionais são `nullable` (structured output
 * estrito não lida bem com campos ausentes).
 */
export const judgeOutputSchema = z.object({
  verdict: z.enum(["scored", "abstained", "needs_review"]),
  score: z.number().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  dimensions: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      status: z.enum(["measured", "proxy", "not_measured"]),
      score: z.number().nullable(),
      rationale: z.string().nullable(),
    }),
  ),
  evidence: z.array(
    z.object({
      observation: z.string(),
      dimensionId: z.string().nullable(),
      quote: z.string().nullable(),
    }),
  ),
  feedback: z.string(),
  uncertainty: z.string().nullable(),
  unmeasured: z.array(z.string()),
  abstentionReason: z.string().nullable(),
  reviewReason: z.string().nullable(),
});

export type JudgeOutput = z.infer<typeof judgeOutputSchema>;

export interface GatewayEvaluationConfig {
  /** URL do gateway (com ou sem `/v1`). Default: env ou gateway público. */
  baseURL?: string;
  /** Modelo default; pode ser sobreposto por chamada. */
  model?: string;
  /** Run ID da plataforma, quando disponível no request. */
  runId?: string;
}

function gatewayBaseUrl(configured: string | undefined): string {
  const value = configured?.trim() || DEFAULT_GATEWAY_BASE_URL;
  return `${value.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`;
}

/** Converte `null` em `undefined` para respeitar `exactOptionalPropertyTypes`. */
function optional(value: string | null): string | undefined {
  return value === null || value.length === 0 ? undefined : value;
}

/**
 * Normaliza a saída do modelo para o contrato de domínio, preenchendo o motivo
 * quando o modelo abstém/revisa sem texto. Campos inválidos permanecem inválidos
 * de propósito: `parseEvaluationResult` no adaptador os rejeita e vira revisão.
 */
export function toEvaluationResult(
  output: JudgeOutput,
  identity: { model: string; promptVersion: string; rubricVersion: string },
  now: Date = new Date(),
): EvaluationResult {
  const base = {
    scale: ATTEMPT_SCORE_SCALE,
    confidence: output.confidence,
    dimensions: output.dimensions.map((dimension) => {
      const rationale = optional(dimension.rationale);
      return {
        id: dimension.id,
        label: dimension.label,
        status: dimension.status,
        score: dimension.score,
        ...(rationale === undefined ? {} : { rationale }),
      };
    }),
    evidence: output.evidence.map((item) => {
      const dimensionId = optional(item.dimensionId);
      const quote = optional(item.quote);
      return {
        observation: item.observation,
        ...(dimensionId === undefined ? {} : { dimensionId }),
        ...(quote === undefined ? {} : { quote }),
      };
    }),
    feedback: output.feedback,
    uncertainty: output.uncertainty,
    unmeasured: output.unmeasured,
    evaluator: identity,
    scoredAt: now.toISOString(),
  };

  if (output.verdict === "abstained") {
    return {
      ...base,
      verdict: "abstained",
      score: null,
      abstentionReason: optional(output.abstentionReason) ?? "avaliação não concluída",
    };
  }
  if (output.verdict === "needs_review") {
    return {
      ...base,
      verdict: "needs_review",
      score: null,
      reviewReason: optional(output.reviewReason) ?? "avaliação precisa de revisão",
    };
  }
  return { ...base, verdict: "scored", score: output.score ?? Number.NaN };
}

/**
 * Cria a função de chamada usada pelo adaptador em produção. A chave é lida a
 * cada invocação; se ausente, lança `MissingApiKeyError` (o adaptador traduz em
 * `needs_review`, nunca em nota).
 */
export function createGatewayEvaluationCall(config: GatewayEvaluationConfig) {
  return async (input: {
    systemPrompt: string;
    untrusted: { label: string; content: string }[];
    promptVersion: string;
    rubricVersion: string;
    model?: string;
    signal?: AbortSignal;
  }): Promise<EvaluationResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new MissingApiKeyError();

    const model =
      input.model?.trim() ||
      config.model?.trim() ||
      process.env["LOVABLE_AI_EVALUATION_MODEL"]?.trim() ||
      "openai/gpt-6-astra";
    const runIdFetch = createLovableAiGatewayRunIdFetch(config.runId);
    const provider = createOpenAI({
      baseURL: gatewayBaseUrl(config.baseURL ?? process.env["LOVABLE_AI_GATEWAY_URL"]),
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });

    const result = streamText({
      model: provider.responses(model),
      messages: buildEvaluatorMessages(input.systemPrompt, input.untrusted),
      output: Output.object({ schema: judgeOutputSchema }),
      // O retry restrito é do adaptador: o SDK não deve repetir por conta própria.
      maxRetries: 0,
      ...(input.signal ? { abortSignal: input.signal } : {}),
      providerOptions: {
        openai: {
          store: false,
          forceReasoning: true,
          reasoningEffort: "medium",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    try {
      const output = await result.output;
      return toEvaluationResult(
        output,
        {
          model,
          promptVersion: input.promptVersion,
          rubricVersion: input.rubricVersion,
        },
        new Date(),
      );
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        throw new EvaluationOutputError();
      }
      throw error;
    }
  };
}
