/**
 * Superfície RPC da avaliação por IA — segura para importar no cliente.
 *
 * O cliente envia apenas `{ type, questionId, response, mode, consent }`. O sinal
 * `consent: true` é validado no servidor por `request-safety.server` ANTES de o
 * avaliador ser importado; sem ele o endpoint devolve abstenção, nunca nota.
 *
 * O carregamento da questão, a referência reservada, o limite por instância e a
 * chave do gateway ficam no módulo `.server.ts`, importado dinamicamente DENTRO
 * do handler (nunca no bundle cliente).
 *
 * Entrada inválida ou sem consentimento vira abstenção com `score: null` — nunca
 * um erro cru de validação e nunca uma nota substituta.
 */

import { createServerFn } from "@tanstack/react-start";

import type { EvaluationResponse } from "./evaluation-io";

/** O validador não rejeita: toda decisão (consentimento, schema, limite) é abstensão. */
interface UnvalidatedInput {
  raw: unknown;
}

export const evaluateResponseFunction = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): UnvalidatedInput => ({ raw }))
  .handler(async ({ data }): Promise<EvaluationResponse> => {
    const { evaluateGuarded } = await import("./request-safety.server");
    return evaluateGuarded(data.raw);
  });
