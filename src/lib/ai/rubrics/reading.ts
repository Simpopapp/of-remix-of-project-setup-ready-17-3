/**
 * Rubricas de Reading (5 tipos) — Fase 5, s2-rubricas.
 *
 * Base normativa: `src/data/exam-spec.ts` e PRD §17.
 * - O gabarito é referência para o juiz (parcialidade e contexto são
 *   interpretados pela IA), nunca soma mecânica de acertos.
 * - Só `read_mcq_multi` tem penalidade oficial por opção errada.
 * - A matriz do exam-spec (Fase 1) pontua os 5 tipos apenas em Reading; a rubrica
 *   segue essa matriz e não inventa dimensão cruzada de Writing. A divergência com
 *   a tabela §17 do PRD central está registrada no relatório do pacote.
 *
 * Módulo puro: zero I/O.
 */

import type { TypeRubric } from "./types";
import { inputLimitsFor } from "./exam-derived";
import { READING_ABSTENTIONS, READING_CAVEATS, RUBRIC_VERSION, dim } from "./shared";

export const READING_RUBRICS: readonly TypeRubric[] = [
  {
    type: "read_fib_dropdown",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      dim({
        id: "reading",
        label: "Leitura",
        weight: 1,
        measurement:
          "Judge comprehension of the passage and the semantic fit of each blank against the reference answers. Give partial credit when only some blanks are correct; do not require every blank to be right for a non-zero score.",
      }),
    ],
    abstentionRules: [...READING_ABSTENTIONS],
    inputLimits: inputLimitsFor("read_fib_dropdown"),
    referenceUsage:
      "O gabarito de cada lacuna é referência do juiz. Aceite equivalentes apenas quando o sentido e a gramática do contexto sustentarem a escolha; não invente uma segunda resposta correta.",
    caveats: [
      ...READING_CAVEATS,
      "Cada lacuna correta vale 1 e não há penalidade por erro; a nota agregada reflete a proporção de lacunas corretas.",
      "O exam-spec registra que a tabela oficial de 2025 pontua apenas Reading neste tipo, apesar do título histórico 'Reading and Writing: Fill in the Blanks'; a rubrica segue essa matriz.",
    ],
  },
  {
    type: "read_mcq_multi",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      dim({
        id: "reading",
        label: "Leitura",
        weight: 1,
        measurement:
          "Judge comprehension of the passage and each selected option against the reference answers. Distinguish a partially correct selection from a wrong one; the answer key is a reference for the judge, not a mechanical sum.",
      }),
    ],
    abstentionRules: [...READING_ABSTENTIONS],
    inputLimits: inputLimitsFor("read_mcq_multi"),
    referenceUsage:
      "O conjunto de respostas corretas é referência do juiz. Avalie a coerência de cada opção com a passagem antes de aplicar a penalidade; não trate a seleção como mera contagem.",
    selectionPenalty: true,
    caveats: [
      ...READING_CAVEATS,
      "Penalidade oficial: opções erradas descontam e o item pode ficar abaixo de zero; a nota de tentativa é normalizada para a escala 0–100 e o feedback explica o desconto.",
    ],
  },
  {
    type: "reorder_paragraphs",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      dim({
        id: "reading",
        label: "Leitura",
        weight: 1,
        measurement:
          "Judge the order of paragraphs/blocks against the reference. Reward adjacent pairs in the correct relative order (partial credit), not only the exact full sequence; use cohesion cues in the text as evidence.",
      }),
    ],
    abstentionRules: [
      ...READING_ABSTENTIONS,
      "Ordem com blocos repetidos ou faltando: abster em vez de reconstruir a sequência pelo aluno.",
    ],
    inputLimits: inputLimitsFor("reorder_paragraphs"),
    referenceUsage:
      "A ordem de referência é do juiz. Evidências devem citar conectores/retomadas do próprio texto, sem revelar a sequência completa ao aluno no feedback.",
    caveats: [
      ...READING_CAVEATS,
      "A pontuação oficial é por pares adjacentes corretos; a nota de treino preserva essa proporção.",
    ],
  },
  {
    type: "read_fib_drag",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      dim({
        id: "reading",
        label: "Leitura",
        weight: 1,
        measurement:
          "Judge comprehension of the passage and whether each dragged word fits the blank semantically, against the reference answers. Give partial credit for the blanks that are correct.",
      }),
    ],
    abstentionRules: [...READING_ABSTENTIONS],
    inputLimits: inputLimitsFor("read_fib_drag"),
    referenceUsage:
      "O gabarito de cada lacuna é referência do juiz. O banco de palavras visível ao aluno não contém a resposta correta por si só; não copie o gabarito completo para o feedback.",
    caveats: [
      ...READING_CAVEATS,
      "Cada lacuna correta vale 1 e não há penalidade por erro; a nota agregada reflete a proporção de lacunas corretas.",
      "O exam-spec lista apenas Reading como habilidade pontuada neste tipo; a rubrica não cria uma dimensão de escrita sem fonte.",
    ],
  },
  {
    type: "read_mcq_single",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      dim({
        id: "reading",
        label: "Leitura",
        weight: 1,
        measurement:
          "Judge comprehension of the passage and the correctness of the chosen option against the reference. Explain the distractor logic with textual evidence; do not reveal the answer to a student who has not submitted.",
      }),
    ],
    abstentionRules: [...READING_ABSTENTIONS],
    inputLimits: inputLimitsFor("read_mcq_single"),
    referenceUsage:
      "A resposta correta é referência do juiz e da explicação pós-envio; nunca deve ser revelada antes do momento seguro.",
    caveats: [
      ...READING_CAVEATS,
      "Não há penalidade por erro; a nota reflete a escolha e a qualidade da justificativa observável.",
    ],
  },
];
