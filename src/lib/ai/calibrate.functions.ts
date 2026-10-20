/**
 * Endpoint de calibração (Fase 5/s4).
 *
 * Client-safe: o módulo do runner é importado dinamicamente, então o bundle do
 * navegador não carrega o adaptador nem o gateway. O input é validado por zod
 * (22 tipos no máximo, sem duplicatas, somente TaskType válidos) e a resposta é
 * APENAS o relatório — nenhuma chave, prompt ou conteúdo de questão.
 */

import { createServerFn } from "@tanstack/react-start";

import { parseCalibrationInput } from "@/data/ai/calibration/input";

export const runCalibrationFunction = createServerFn({ method: "POST" })
  .inputValidator(parseCalibrationInput)
  .handler(async ({ data }) => {
    const { runCalibration } = await import("./calibration.server");
    return runCalibration(data);
  });
