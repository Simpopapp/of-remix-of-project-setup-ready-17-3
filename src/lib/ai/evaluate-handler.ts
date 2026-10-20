/**
 * Orquestração testável da avaliação — sem `createServerFn`, sem I/O de rede.
 *
 * Fluxo: carrega a questão no servidor → separa referência reservada de conteúdo
 * visível → compõe o system prompt → chama o adaptador → devolve só o DTO.
 *
 * Falha ao carregar a questão ou referência insuficiente vira abstenção, nunca
 * erro cru e nunca nota substituta.
 */

import type { Question, TaskType } from "@/domain";

import { DEFAULT_EVALUATION_MODEL, type EvaluationAdapter } from "./adapter.server";
import {
  RUBRIC_UNAVAILABLE_VERSION,
  responseTextOf,
  type EvaluationRequestPayload,
  type EvaluationResponse,
} from "./evaluation-io";
import { JUDGE_PROMPT_VERSION, composeJudgePrompt } from "./judge-policy";
import { referenceForQuestion, withStudentResponse } from "./reference";
import { abstainedResult, needsReviewResult } from "./result-builders";

export interface EvaluationRubric {
  text: string;
  version: string;
}

export interface EvaluationHandlerDependencies {
  adapter: EvaluationAdapter;
  loadQuestionsByType: (type: TaskType) => Promise<Question[]>;
  /** Rubricas chegam de s2; até lá o juiz opera só com a política + referência. */
  rubricFor?: (type: TaskType) => EvaluationRubric | undefined;
  model?: string;
  nowMs?: () => number;
}

export type EvaluationHandler = (payload: EvaluationRequestPayload) => Promise<EvaluationResponse>;

export function createEvaluationHandler(deps: EvaluationHandlerDependencies): EvaluationHandler {
  const nowMs = deps.nowMs ?? (() => Date.now());

  return async function handler(payload) {
    const rubric = deps.rubricFor?.(payload.type);
    const identity = {
      model: deps.model?.trim() || DEFAULT_EVALUATION_MODEL,
      promptVersion: JUDGE_PROMPT_VERSION,
      rubricVersion: rubric?.version.trim() || RUBRIC_UNAVAILABLE_VERSION,
    };

    let question: Question | undefined;
    try {
      const questions = await deps.loadQuestionsByType(payload.type);
      question = questions.find((candidate) => candidate.id === payload.questionId);
    } catch {
      return {
        evaluation: needsReviewResult(
          identity,
          nowMs(),
          "não foi possível carregar a questão no servidor",
          "O banco de questões não pôde ser carregado; tente novamente.",
        ),
      };
    }

    if (!question) {
      return {
        evaluation: abstainedResult(
          identity,
          nowMs(),
          "questão não encontrada para o tipo informado",
          "A questão não foi encontrada; a avaliação não foi realizada.",
        ),
      };
    }
    if (question.type !== payload.type) {
      return {
        evaluation: abstainedResult(
          identity,
          nowMs(),
          "questão não corresponde ao tipo informado",
          "A questão não corresponde ao tipo de tarefa; a avaliação não foi realizada.",
        ),
      };
    }

    const reference = referenceForQuestion(question);
    if (!reference.hasReference) {
      return {
        evaluation: abstainedResult(
          identity,
          nowMs(),
          "referência de avaliação indisponível para esta questão",
          "Esta questão não tem referência suficiente para ser avaliada.",
        ),
      };
    }

    const systemPrompt = composeJudgePrompt({
      ...(rubric?.text ? { rubric: rubric.text } : {}),
      referenceSamples: reference.judgeReference,
    });
    const untrusted = withStudentResponse(reference.untrusted, responseTextOf(payload.response));

    const evaluation = await deps.adapter.evaluate({
      ...payload,
      systemPrompt,
      untrusted,
      rubricVersion: identity.rubricVersion,
      promptVersion: identity.promptVersion,
      referenceSamples: reference.protectedSamples,
      model: identity.model,
    });

    return { evaluation };
  };
}
