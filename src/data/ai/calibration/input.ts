/**
 * Contrato de entrada do runner de calibração.
 *
 * Fica num módulo client-safe e puro para que os testes possam validar o schema
 * sem importar `createServerFn` (o wrapper em `src/lib/ai/calibrate.functions.ts`
 * só compõe o schema com o handler).
 */

import { TASK_TYPES, type TaskType } from "@/domain";
import { z } from "zod";

/** Nunca mais do que os 22 tipos do formato vigente. */
export const MAX_CALIBRATION_TYPES = TASK_TYPES.length;

const taskTypeSchema = z.custom<TaskType>(
  (value) => typeof value === "string" && (TASK_TYPES as readonly string[]).includes(value),
  { message: "tipo de tarefa inválido" },
);

export const calibrationRequestSchema = z
  .object({
    types: z
      .array(taskTypeSchema)
      .transform((types) => Array.from(new Set(types)))
      .refine((types) => types.length <= MAX_CALIBRATION_TYPES, {
        message: `no máximo ${String(MAX_CALIBRATION_TYPES)} tipos por execução`,
      })
      .optional(),
  })
  .strict();

export type CalibrationRunInput = z.infer<typeof calibrationRequestSchema>;

/**
 * Valida e normaliza o input público:
 * - tipo fora dos 22 → erro de validação;
 * - duplicatas → removidas, preservando a primeira ocorrência;
 * - `types` ausente → todos os tipos (o runner decide).
 */
export function parseCalibrationInput(raw: unknown): CalibrationRunInput {
  return calibrationRequestSchema.parse(raw);
}
