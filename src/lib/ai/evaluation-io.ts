/**
 * Contrato de entrada/saída da avaliação por IA — seguro para importar no cliente.
 *
 * O cliente envia APENAS `{ type, questionId, response, mode }`. A referência
 * (gabarito/transcrição) é resolvida no servidor e nunca cruza a fronteira.
 *
 * Os limites do §1.12 do PRD (1–20 000 caracteres por campo, id de 1–64 chars,
 * modos practice/session/mock) vivem aqui para serem compartilhados entre o
 * `inputValidator` da server function e o adaptador.
 */

import { ZodError, z } from "zod";

import type { EvaluationResult } from "@/domain";
import { isTaskType, type TaskType } from "@/domain";

export const EVALUATION_MODES = ["practice", "session", "mock"] as const;
export type EvaluationMode = (typeof EVALUATION_MODES)[number];

export const DEFAULT_EVALUATION_MODEL = "openai/gpt-6-astra";

export const MAX_QUESTION_ID_LENGTH = 64;
export const MAX_RESPONSE_FIELD_LENGTH = 20_000;
export const QUESTION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export interface EvaluationResponsePayload {
  text?: string | undefined;
  transcript?: string | undefined;
}

export interface EvaluationRequestPayload {
  type: TaskType;
  questionId: string;
  response: EvaluationResponsePayload;
  mode: EvaluationMode;
}

/** DTO devolvido pela server function — só o contrato de domínio. */
export interface EvaluationResponse {
  evaluation: EvaluationResult;
}

const responseField = z.string().max(MAX_RESPONSE_FIELD_LENGTH).optional();

export const evaluationRequestSchema = z
  .object({
    type: z.string().refine((value): value is TaskType => isTaskType(value), {
      message: "tipo de tarefa desconhecido",
    }),
    questionId: z
      .string()
      .min(1)
      .max(MAX_QUESTION_ID_LENGTH)
      .regex(QUESTION_ID_PATTERN, "questionId inválido"),
    response: z
      .object({
        text: responseField,
        transcript: responseField,
      })
      .strict(),
    mode: z.enum(EVALUATION_MODES),
  })
  .strict();

export type EvaluationRequestParseResult =
  { ok: true; data: EvaluationRequestPayload } | { ok: false; error: ZodError };

export function parseEvaluationRequest(raw: unknown): EvaluationRequestParseResult {
  const parsed = evaluationRequestSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, error: parsed.error };
}

/** Texto agregado da resposta do aluno (só campos preenchidos). */
export function responseTextOf(response: EvaluationResponsePayload): string {
  return [response.text, response.transcript]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n\n");
}

/**
 * Motivo único de entrada inválida. A UI nunca recebe um erro cru de validação:
 * o wrapper transforma isso em abstenção com `score: null`.
 */
export const INVALID_INPUT_REASON = "entrada inválida/expirou";

/** Versão usada enquanto s2-rubricas ainda não forneceu rubrica para o tipo. */
export const RUBRIC_UNAVAILABLE_VERSION = "rubrics@unavailable";
