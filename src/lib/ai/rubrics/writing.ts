/**
 * Rubricas de Writing (2 tipos) — Fase 5, s2-rubricas.
 *
 * Base normativa: `src/data/exam-spec.ts` e PRD §17.
 * - `swt`: 1 frase de 5–75 palavras; dimensões conteúdo, forma, gramática e
 *   vocabulário. Fora da faixa/mais de uma frase é violação de Form (penaliza a
 *   dimensão), NUNCA abstenção.
 * - `write_essay`: 200–300 palavras; dimensões conteúdo, desenvolvimento,
 *   estrutura, gramática, vocabulário e ortografia. A dimensão `form` existe para
 *   acolher a regra oficial de contagem (Form 0 fora de 120–380 palavras), que o
 *   PRD manda penalizar em vez de abster — decisão registrada no relatório.
 *
 * Módulo puro: zero I/O.
 */

import type { TypeRubric } from "./types";
import { inputLimitsFor } from "./exam-derived";
import {
  RUBRIC_VERSION,
  WRITING_ABSTENTIONS,
  WRITING_CAVEATS,
  contentDimension,
  dim,
} from "./shared";

export const WRITING_RUBRICS: readonly TypeRubric[] = [
  {
    type: "swt",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      contentDimension(
        0.35,
        "Compare the summary with the passage's main ideas: reward coverage of the central points and relations without copying long spans of the passage. Off-topic content does not count as coverage.",
      ),
      dim({
        id: "form",
        label: "Forma",
        weight: 0.25,
        measurement:
          "Check that the response is ONE complete sentence and between 5 and 75 words. More than one sentence or a length outside the range scores Form as zero; never abstain solely because of length or sentence count.",
      }),
      dim({
        id: "grammar",
        label: "Gramática",
        weight: 0.2,
        measurement:
          "Judge sentence-level accuracy: agreement, tense, articles, prepositions and clause structure. A single grammatical sentence that preserves meaning should score above fragmented but longer text.",
      }),
      dim({
        id: "vocabulary",
        label: "Vocabulário",
        weight: 0.2,
        measurement:
          "Judge range and precision of vocabulary in the summary; penalize inappropriate word choice, invented terms and meaningless repetition.",
      }),
    ],
    abstentionRules: [...WRITING_ABSTENTIONS],
    inputLimits: inputLimitsFor("swt"),
    referenceUsage:
      "A passagem-fonte é referência reservada do juiz para comparar conteúdo; nunca é uma frase-modelo a copiar para o feedback nem uma correção palavra a palavra.",
    caveats: [
      ...WRITING_CAVEATS,
      "Uma frase incompleta ou com mais de uma frase penaliza a dimensão forma; não é motivo de abstenção.",
    ],
  },
  {
    type: "write_essay",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      contentDimension(
        0.25,
        "Judge whether the essay addresses the prompt with a clear position and relevant arguments. Penalize off-topic content, contradictions and claims with no support in the text.",
      ),
      dim({
        id: "form",
        label: "Forma",
        weight: 0.1,
        measurement:
          "Check the word count (official target 200–300; Form is zero below 120 or above 380) and whether the text is a complete essay rather than notes or bullet points. Length/form problems penalize this dimension and never justify abstention by themselves.",
      }),
      dim({
        id: "development",
        label: "Desenvolvimento",
        weight: 0.15,
        measurement:
          "Judge how each argument is developed with explanation and example; reward depth and progression over a bare list of points.",
      }),
      dim({
        id: "structure",
        label: "Estrutura",
        weight: 0.15,
        measurement:
          "Judge paragraphing, logical progression, cohesion and conclusion. The introduction, body and conclusion must be recognizable and connected.",
      }),
      dim({
        id: "grammar",
        label: "Gramática",
        weight: 0.15,
        measurement:
          "Judge sentence-level accuracy and complexity: agreement, tense, articles, prepositions, clause structure and punctuation where it affects meaning.",
      }),
      dim({
        id: "vocabulary",
        label: "Vocabulário",
        weight: 0.1,
        measurement:
          "Judge range, precision and register of vocabulary; penalize inappropriate word choice and repeated fillers.",
      }),
      dim({
        id: "orthography",
        label: "Ortografia",
        weight: 0.1,
        measurement:
          "Judge spelling accuracy: count misspellings and their effect on readability; do not confuse spelling with grammar.",
      }),
    ],
    abstentionRules: [...WRITING_ABSTENTIONS],
    inputLimits: inputLimitsFor("write_essay"),
    referenceUsage:
      "Não há resposta-modelo única: a referência do juiz é o prompt e os critérios oficiais. Nunca copie texto de exemplo nem invente um gabarito de redação.",
    caveats: [
      ...WRITING_CAVEATS,
      "A dimensão forma acolhe a regra oficial de contagem de palavras (Form 0 fora de 120–380); o alvo é 200–300 palavras.",
      "A rubrica segue os critérios públicos de Write Essay; a nota final continua sendo uma estimativa de treino.",
    ],
  },
];
