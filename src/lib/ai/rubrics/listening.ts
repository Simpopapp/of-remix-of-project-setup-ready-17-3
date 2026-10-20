/**
 * Rubricas de Listening (8 tipos) — Fase 5, s2-rubricas.
 *
 * Base normativa: `src/data/exam-spec.ts` e PRD §17. A transcrição do item é a
 * referência do juiz quando existe; o aluno não a recebe antes do momento seguro.
 *
 * Dimensões cruzadas seguem a matriz do exam-spec (Fase 1):
 * - `lst_fib` e `wfd`: Listening + Writing.
 * - `lst_hcs` e `lst_hiw`: Listening + Reading.
 * - `lst_mcq_multi`, `lst_mcq_single` e `lst_smw`: Listening.
 * - `sst`: critérios de escrita (content/form/grammar/vocabulary/orthography).
 *
 * Penalidade oficial só em `lst_mcq_multi` e `lst_hiw`.
 *
 * Módulo puro: zero I/O.
 */

import type { TypeRubric } from "./types";
import { inputLimitsFor } from "./exam-derived";
import {
  LISTENING_ABSTENTIONS,
  LISTENING_CAVEATS,
  RUBRIC_VERSION,
  contentDimension,
  dim,
} from "./shared";

export const LISTENING_RUBRICS: readonly TypeRubric[] = [
  {
    type: "sst",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      contentDimension(
        0.3,
        "Compare the summary with the reference transcript: cover the main points and their relations. Penalize invented content, copied fragments without meaning and off-topic summaries.",
      ),
      dim({
        id: "form",
        label: "Forma",
        weight: 0.2,
        measurement:
          "Check the word count (official target 50–70; Form is zero outside 40–100) and whether the response is a coherent summary in complete sentences. Length/form problems penalize this dimension and never justify abstention by themselves.",
      }),
      dim({
        id: "grammar",
        label: "Gramática",
        weight: 0.2,
        measurement:
          "Judge sentence-level accuracy: agreement, tense, articles, prepositions and clause structure.",
      }),
      dim({
        id: "vocabulary",
        label: "Vocabulário",
        weight: 0.15,
        measurement:
          "Judge range and precision of vocabulary in the summary; penalize inappropriate word choice and meaningless repetition.",
      }),
      dim({
        id: "orthography",
        label: "Ortografia",
        weight: 0.15,
        measurement:
          "Judge spelling accuracy: count misspellings and their effect on readability; do not confuse spelling with grammar.",
      }),
    ],
    abstentionRules: [
      ...LISTENING_ABSTENTIONS,
      "Resumo que não corresponde ao áudio (outro tema): abster em vez de penalizar conteúdo inventado como se fosse resumo.",
    ],
    inputLimits: inputLimitsFor("sst"),
    referenceUsage:
      "A transcrição do áudio é referência reservada do juiz para comparar conteúdo; nunca é um resumo-modelo a copiar para o feedback.",
    caveats: [
      ...LISTENING_CAVEATS,
      "A faixa oficial é 50–70 palavras; fora de 40–100 o critério Form oficial é zerado. O limite penaliza a dimensão forma, não gera abstenção.",
    ],
  },
  {
    type: "lst_mcq_multi",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      dim({
        id: "listening",
        label: "Compreensão auditiva",
        weight: 1,
        measurement:
          "Judge comprehension of the audio and each selected option against the reference answers. Distinguish a partially correct selection from a wrong one; the answer key is a reference for the judge, not a mechanical sum.",
      }),
    ],
    abstentionRules: [...LISTENING_ABSTENTIONS],
    inputLimits: inputLimitsFor("lst_mcq_multi"),
    referenceUsage:
      "O conjunto de respostas corretas é referência do juiz. Avalie a coerência de cada opção com o áudio antes de aplicar a penalidade.",
    selectionPenalty: true,
    caveats: [
      ...LISTENING_CAVEATS,
      "Penalidade oficial: opções erradas descontam e o item pode ficar abaixo de zero; a nota de tentativa é normalizada para 0–100 e o feedback explica o desconto.",
    ],
  },
  {
    type: "lst_fib",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      dim({
        id: "listening",
        label: "Compreensão auditiva",
        weight: 0.6,
        measurement:
          "Judge whether each typed word matches the word heard in the audio (reference transcript). A word that is semantically plausible but not what was said does not earn the point.",
      }),
      dim({
        id: "writing",
        label: "Escrita",
        weight: 0.4,
        measurement:
          "Judge spelling and word form of each typed word: a word heard correctly but spelled incorrectly does not earn the point. Do not penalize handwriting (there is none) or punctuation outside the blanks.",
      }),
    ],
    abstentionRules: [
      ...LISTENING_ABSTENTIONS,
      "Nenhuma lacuna preenchida: abster; não transformar ausência de resposta em zero.",
    ],
    inputLimits: inputLimitsFor("lst_fib"),
    referenceUsage:
      "A transcrição com lacunas e o gabarito de cada palavra são referência reservada do juiz; não revele a transcrição completa no feedback.",
    caveats: [
      ...LISTENING_CAVEATS,
      "Cada palavra correta e escrita corretamente vale 1; a nota de treino reflete essa proporção.",
    ],
  },
  {
    type: "lst_hcs",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      dim({
        id: "listening",
        label: "Compreensão auditiva",
        weight: 0.6,
        measurement:
          "Judge comprehension of the audio and whether the chosen summary captures its central meaning, against the reference. Do not reward an option that only repeats keywords from the audio.",
      }),
      dim({
        id: "reading",
        label: "Leitura",
        weight: 0.4,
        measurement:
          "Judge comprehension of the summary options themselves: recognize the option that is faithful to the audio and rule out summaries that distort, omit or overgeneralize it.",
      }),
    ],
    abstentionRules: [...LISTENING_ABSTENTIONS],
    inputLimits: inputLimitsFor("lst_hcs"),
    referenceUsage:
      "O resumo correto e a transcrição são referência do juiz. O feedback explica por que o resumo escolhido falha sem revelar a opção correta antes do momento seguro.",
    caveats: [
      ...LISTENING_CAVEATS,
      "Sem penalidade por erro; a nota reflete a escolha e a compreensão demonstrada.",
    ],
  },
  {
    type: "lst_mcq_single",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      dim({
        id: "listening",
        label: "Compreensão auditiva",
        weight: 1,
        measurement:
          "Judge comprehension of the audio and the correctness of the chosen option against the reference. Explain the distractor logic with evidence from the audio; do not reveal the answer before submission.",
      }),
    ],
    abstentionRules: [...LISTENING_ABSTENTIONS],
    inputLimits: inputLimitsFor("lst_mcq_single"),
    referenceUsage:
      "A resposta correta é referência do juiz e da explicação pós-envio; nunca deve ser revelada antes do momento seguro.",
    caveats: [
      ...LISTENING_CAVEATS,
      "A matriz do exam-spec lista apenas Listening como habilidade pontuada neste tipo; a rubrica não cria dimensão de leitura sem fonte.",
    ],
  },
  {
    type: "lst_smw",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      dim({
        id: "listening",
        label: "Compreensão auditiva",
        weight: 1,
        measurement:
          "Judge whether the selected word fits the missing final segment so that the sentence/utterance keeps the meaning predicted by the audio. The beep replaces the word; judge coherence with the preceding context.",
      }),
    ],
    abstentionRules: [...LISTENING_ABSTENTIONS],
    inputLimits: inputLimitsFor("lst_smw"),
    referenceUsage:
      "A palavra correta e a transcrição são referência do juiz; o feedback explica a coerência do trecho sem entregar a palavra antes do momento seguro.",
    caveats: [
      ...LISTENING_CAVEATS,
      "Sem penalidade por erro; a nota reflete a escolha e a coerência demonstrada.",
    ],
  },
  {
    type: "lst_hiw",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      dim({
        id: "listening",
        label: "Compreensão auditiva",
        weight: 0.6,
        measurement:
          "Judge whether each highlighted word is really different between the audio and the displayed transcript, against the reference list of divergent words. Do not count a word that matches the audio.",
      }),
      dim({
        id: "reading",
        label: "Leitura",
        weight: 0.4,
        measurement:
          "Judge the student's reading of the displayed transcript while listening: recognizing which displayed words do not match what was heard, without being misled by plausible but correct words.",
      }),
    ],
    abstentionRules: [
      ...LISTENING_ABSTENTIONS,
      "Nenhuma palavra destacada: abster; não transformar ausência de seleção em zero.",
    ],
    inputLimits: inputLimitsFor("lst_hiw"),
    referenceUsage:
      "A lista de palavras divergentes e a transcrição correta são referência reservada do juiz. O feedback aponta a natureza do erro sem listar todas as divergências de uma vez.",
    selectionPenalty: true,
    caveats: [
      ...LISTENING_CAVEATS,
      "Penalidade oficial: +1 por palavra correta destacada e −1 por palavra errada; a nota de tentativa é normalizada para 0–100.",
      "O exam-spec registra Listening + Reading como habilidades pontuadas neste tipo (a tabela §17 do PRD cita Writing); a rubrica segue o exam-spec e a divergência está registrada no relatório do pacote.",
    ],
  },
  {
    type: "wfd",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      dim({
        id: "listening",
        label: "Compreensão auditiva",
        weight: 0.6,
        measurement:
          "Compare the dictated sentence with the reference transcript word by word: omitted words do not earn the point. Judge whether the student heard the sentence correctly, not whether the sentence is plausible.",
      }),
      dim({
        id: "writing",
        label: "Escrita",
        weight: 0.4,
        measurement:
          "Judge spelling and word form of every word: a word heard correctly but spelled incorrectly does not earn the point. Do not penalize capitalization unless it changes the word.",
      }),
    ],
    abstentionRules: [...LISTENING_ABSTENTIONS],
    inputLimits: inputLimitsFor("wfd"),
    referenceUsage:
      "A transcrição do ditado é referência reservada do juiz. Nunca copie a frase de referência para o feedback antes do momento seguro; a evidência deve citar apenas o que o aluno escreveu.",
    caveats: [
      ...LISTENING_CAVEATS,
      "A tarefa pontua +1 por palavra correta e escrita corretamente, sem penalidade por omissão; a nota de treino preserva essa proporção.",
      "Faixa de resposta de 3–15 palavras derivada do PRD §17, porque o exam-spec descreve apenas o áudio de 3–5 s.",
    ],
  },
];
