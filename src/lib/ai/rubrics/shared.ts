/**
 * Peças comuns das rubricas (Fase 5 — s2-rubricas).
 *
 * Aqui vivem as definições de dimensão reutilizadas por família e os textos de
 * honestidade que TODA rubrica daquela família precisa declarar. Manter isso num
 * lugar só evita que dois tipos da mesma família digam coisas diferentes sobre
 * pronúncia, proxy ou penalidade.
 *
 * Módulo puro: zero I/O.
 */

import type { DimensionStatus } from "@/domain";

import type { RubricDimension } from "./types";

/** Versão única das rubricas desta fase. Bump quando qualquer dimensão/peso mudar. */
export const RUBRIC_VERSION = "rubric@1";

export interface DimensionInput {
  id: string;
  label: string;
  weight: number;
  measurement: string;
  defaultStatus?: DimensionStatus;
}

/** Constrói uma dimensão com status default `measured`. */
export function dim(input: DimensionInput): RubricDimension {
  return {
    id: input.id,
    label: input.label,
    weight: input.weight,
    measurement: input.measurement,
    defaultStatus: input.defaultStatus ?? "measured",
  };
}

/** Pronúncia: nunca medida sem sinal de áudio real analisado. */
export function pronunciationDimension(weight: number): RubricDimension {
  return dim({
    id: "pronunciation",
    label: "Pronúncia (não avaliada sem áudio)",
    weight,
    defaultStatus: "not_measured",
    measurement:
      "Only measurable with real audio analysis of the student's speech. Without an analysed audio signal, return status not_measured, score null, a rationale explaining that pronunciation was not assessed, and include the dimension id in unmeasured. Never infer pronunciation from the transcript or from spelling.",
  });
}

/** Fluência: inferida de transcrição é PROXY rotulado, nunca prosódia medida. */
export function fluencyProxyDimension(weight: number): RubricDimension {
  return dim({
    id: "oral_fluency",
    label: "Fluência oral (proxy da transcrição)",
    weight,
    defaultStatus: "proxy",
    measurement:
      "Infer only from the transcript: false starts, repetitions, self-corrections, filler words and whether the response runs as connected speech. Label the result explicitly as a proxy in the rationale and in uncertainty; do not claim that pitch, stress, rhythm or pacing were measured from audio.",
  });
}

export function contentDimension(weight: number, measurement: string): RubricDimension {
  return dim({ id: "content", label: "Conteúdo", weight, measurement });
}

/* ------------------------------------------------------------------ */
/* Regras comuns por família                                          */
/* ------------------------------------------------------------------ */

export const SPEAKING_ABSTENTIONS: readonly string[] = [
  'Resposta vazia, silêncio ou áudio inaudível: não pontuar; devolver verdict "abstained" com score null e motivo claro em pt-BR.',
  'Sem sinal de áudio analisável: não estimar pronúncia; marcar a dimensão como "not_measured" com score null e incluí-la em unmeasured.',
  "Resposta sem inglês suficiente para julgar (ruído, outra língua, fala cortada): abster em vez de penalizar com uma nota substituta.",
];

export const SPEAKING_CAVEATS: readonly string[] = [
  "Pesos aproximados: a Pearson não publica pesos numéricos por dimensão; a matriz tarefa×habilidade está registrada em src/data/exam-spec.ts.",
  'Pronúncia só é pontuada com análise real de áudio; sem esse sinal fica "não avaliada" (score null, listada em unmeasured).',
  "Fluência derivada de transcrição é um proxy rotulado, nunca uma medida de prosódia.",
  "Toda nota é uma estimativa de treino na escala 0–100, não a nota oficial do PTE Academic.",
];

export const WRITING_ABSTENTIONS: readonly string[] = [
  'Resposta vazia: não pontuar; devolver verdict "abstained" com score null e motivo em pt-BR.',
  "Resposta predominantemente em outra língua (não em inglês): abster, sem nota substituta.",
  "Resposta sem conteúdo suficiente para comparar com a referência (ex.: apenas pontuação ou ruído): abster em vez de atribuir zero.",
];

export const WRITING_CAVEATS: readonly string[] = [
  "Pesos aproximados: os critérios públicos por tarefa não têm pesos numéricos oficiais; a matriz tarefa×habilidade está em src/data/exam-spec.ts.",
  "Limite de palavras é critério de Form, não motivo de abstenção: texto fora da faixa penaliza a dimensão form e o feedback explica o motivo.",
  "Toda nota é uma estimativa de treino na escala 0–100, não a nota oficial do PTE Academic.",
];

export const READING_ABSTENTIONS: readonly string[] = [
  'Nenhuma opção ou nenhum encaixe selecionado: não pontuar; devolver verdict "abstained" com score null e motivo em pt-BR.',
  "Resposta em formato inválido para o item (opção inexistente, mais seleções que o permitido, ordem incompleta): abster em vez de adivinhar a intenção.",
  "Texto de referência ausente ou ilegível no servidor: abster; nunca pontuar sem a passagem de referência.",
];

export const READING_CAVEATS: readonly string[] = [
  "A pontuação oficial de Reading usa a distribuição total da seção; esta rubrica produz uma estimativa de treino por item.",
  "Pesos aproximados: os critérios públicos por tarefa não têm pesos numéricos oficiais.",
  "O gabarito é referência para o juiz, não correção mecânica: parcialidade e contexto são interpretados pela IA com evidências.",
  "Toda nota é uma estimativa de treino na escala 0–100, não a nota oficial do PTE Academic.",
];

export const LISTENING_ABSTENTIONS: readonly string[] = [
  "Áudio ou transcrição de referência ausente/inaudível: abster; não pontuar sem o material que sustenta a comparação.",
  'Resposta vazia: não pontuar; devolver verdict "abstained" com score null e motivo em pt-BR.',
  "Resposta em formato inválido para o item (opção inexistente, lacuna vazia, seleção fora da transcrição): abster em vez de inventar a resposta.",
];

export const LISTENING_CAVEATS: readonly string[] = [
  "A transcrição do item é a referência do juiz quando existe; o aluno não a recebe antes do momento seguro.",
  "A pontuação oficial de Listening usa a distribuição total da seção; esta rubrica produz uma estimativa de treino por item.",
  "Pesos aproximados: os critérios públicos por tarefa não têm pesos numéricos oficiais.",
  "Toda nota é uma estimativa de treino na escala 0–100, não a nota oficial do PTE Academic.",
];
