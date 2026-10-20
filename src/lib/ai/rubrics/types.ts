/**
 * Tipos da rubrica por tipo de tarefa (Fase 5 — s2-rubricas).
 *
 * Uma rubrica descreve como o juiz de IA deve medir UMA resposta do tipo, no
 * formato vigente do PTE Academic. Ela NÃO contém questão, gabarito nem
 * resposta-modelo: isso entra em runtime pela referência reservada de s1.
 *
 * Regras de honestidade embutidas no tipo:
 * - `defaultStatus` obriga cada dimensão a declarar se é `measured`, `proxy` ou
 *   `not_measured`. Pronúncia sem análise real de áudio é sempre `not_measured`;
 *   fluência inferida de transcrição é sempre `proxy`.
 * - `weights` são aproximações relativas (somam 1 por tipo, ±0.001). Não existe
 *   peso numérico publicado pela Pearson por dimensão.
 * - `inputLimits` deriva do `exam-spec.ts`; quando o limite não existe lá, a
 *   origem alternativa fica registrada na nota e no relatório do pacote.
 *
 * Módulo puro: zero I/O, zero relógio, zero aleatoriedade.
 */

import type { DimensionStatus, TaskType } from "@/domain";

/** Uma dimensão avaliável dentro de um tipo de tarefa. */
export interface RubricDimension {
  /** id estável em snake_case (`content`, `oral_fluency`, `pronunciation`, ...). */
  id: string;
  /** rótulo humano em pt-BR para exibição no resultado. */
  label: string;
  /** peso relativo 0–1; a soma das dimensões do tipo é 1 (±0.001). */
  weight: number;
  /** regra de como medir, em inglês (vai ao system prompt do juiz). */
  measurement: string;
  /** status esperado por padrão: medido, proxy rotulado ou não avaliado. */
  defaultStatus: DimensionStatus;
}

/** Limites de conteúdo do tipo, derivados do formato oficial. */
export interface RubricInputLimits {
  /** máximo de caracteres, quando o formato define um teto textual. */
  maxChars?: number | undefined;
  /** mínimo de palavras da RESPOSTA escrita, quando o formato define faixa. */
  minWords?: number | undefined;
  /** máximo de palavras da RESPOSTA escrita, quando o formato define faixa. */
  maxWords?: number | undefined;
  /** origem/observação do limite em pt-BR (nunca um número sem fonte). */
  note?: string | undefined;
}

/** Rubrica completa de um tipo de tarefa. */
export interface TypeRubric {
  type: TaskType;
  /** versão versionada da rubrica (`rubric@N`). */
  rubricVersion: string;
  /** dimensões avaliáveis; sempre ao menos uma. */
  dimensions: RubricDimension[];
  /** regras de abstenção em pt-BR; o juiz NÃO pontua quando alguma se aplica. */
  abstentionRules: string[];
  /** limites de conteúdo derivados do formato oficial. */
  inputLimits: RubricInputLimits;
  /** como o gabarito entra: sempre "referência para o juiz", nunca correção mecânica. */
  referenceUsage: string;
  /** true apenas nos tipos com penalidade oficial por opção errada. */
  selectionPenalty?: boolean;
  /** notas de honestidade/aproximação em pt-BR (pesos, penalidades, limites). */
  caveats: string[];
}
