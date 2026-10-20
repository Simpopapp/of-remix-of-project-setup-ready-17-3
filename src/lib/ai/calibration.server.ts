/**
 * Runner server-only da calibração (Fase 5/s4).
 *
 * Para cada item do corpus: carrega a questão real, separa a referência
 * reservada, compõe o prompt com a rubrica de s2 e chama o adaptador de s1. O
 * runner NÃO decide nota: apenas agrega o que o avaliador devolveu.
 *
 * Erros por item nunca derrubam o lote — viram `needs_review` com `score: null`.
 * Logs contêm apenas ids, veredito, nota e duração; nunca resposta, questão,
 * gabarito ou feedback. A chave é lida dentro da chamada, nunca em escopo de
 * módulo.
 */

import {
  CALIBRATION_CORPUS,
  itemsForType,
  type CalibrationItem,
} from "@/data/ai/calibration/corpus";
import type { CalibrationRunInput } from "@/data/ai/calibration/input";
import { loadQuestionsByType } from "@/data/loader";
import { TASK_TYPES, type Question, type TaskType, type Verdict } from "@/domain";

import { DEFAULT_EVALUATION_MODEL, type EvaluationAdapter } from "./adapter.server";
import { errorCodeOf } from "./errors";
import { RUBRIC_UNAVAILABLE_VERSION, responseTextOf } from "./evaluation-io";
import { JUDGE_PROMPT_VERSION, composeJudgePrompt } from "./judge-policy";
import { evaluationRubricFor, type EvaluationRubricView } from "./prompts";
import { referenceForQuestion, withStudentResponse } from "./reference";
import {
  buildCalibrationReport,
  type CalibrationOutcome,
  type CalibrationReport,
} from "./calibration-report";

export interface CalibrationLogEntry {
  type: TaskType;
  questionId: string;
  verdict: Verdict;
  score: number | null;
  durationMs: number;
  errorKind?: string;
}

export interface CalibrationDependencies {
  adapter: EvaluationAdapter;
  loadQuestionsByType: (type: TaskType) => Promise<Question[]>;
  rubricFor: (type: TaskType) => EvaluationRubricView;
  model: string;
  nowMs: () => number;
  log: (entry: CalibrationLogEntry) => void;
}

export type CalibrationDependencyOverrides = Partial<CalibrationDependencies>;

let defaultAdapterPromise: Promise<EvaluationAdapter> | undefined;

/**
 * Adaptador real só é construído quando não há injeção — assim os testes com
 * fake não carregam o gateway nem tocam em `LOVABLE_API_KEY`.
 */
function getDefaultAdapter(): Promise<EvaluationAdapter> {
  defaultAdapterPromise ??= (async () => {
    const [{ createEvaluationAdapter }, { createGatewayEvaluationCall }] = await Promise.all([
      import("./adapter.server"),
      import("./gateway/evaluate-call.server"),
    ]);
    return createEvaluationAdapter({ callModel: createGatewayEvaluationCall({}) });
  })();
  return defaultAdapterPromise;
}

function defaultLog(entry: CalibrationLogEntry): void {
  console.info("[ai:calibration]", entry);
}

async function resolveDependencies(
  overrides: CalibrationDependencyOverrides,
): Promise<CalibrationDependencies> {
  const model =
    overrides.model?.trim() ||
    process.env["LOVABLE_AI_EVALUATION_MODEL"]?.trim() ||
    DEFAULT_EVALUATION_MODEL;

  return {
    adapter: overrides.adapter ?? (await getDefaultAdapter()),
    loadQuestionsByType: overrides.loadQuestionsByType ?? loadQuestionsByType,
    rubricFor: overrides.rubricFor ?? evaluationRubricFor,
    model,
    nowMs: overrides.nowMs ?? (() => Date.now()),
    log: overrides.log ?? defaultLog,
  };
}

/** Deduplica e ordena pelo catálogo canônico; `[]` significa nenhum tipo. */
function resolveTypes(input: CalibrationRunInput): TaskType[] {
  const requested = input.types ?? TASK_TYPES;
  return TASK_TYPES.filter((type) => requested.includes(type));
}

async function evaluateItem(
  item: CalibrationItem,
  deps: CalibrationDependencies,
): Promise<CalibrationOutcome> {
  const startedAt = deps.nowMs();

  const finish = (
    verdict: Verdict,
    score: number | null,
    errorKind?: string,
  ): CalibrationOutcome => {
    deps.log({
      type: item.type,
      questionId: item.questionId,
      verdict,
      score,
      durationMs: deps.nowMs() - startedAt,
      ...(errorKind ? { errorKind } : {}),
    });
    return {
      type: item.type,
      questionId: item.questionId,
      referenceScore: item.referenceScore,
      verdict,
      score,
    };
  };

  try {
    const questions = await deps.loadQuestionsByType(item.type);
    const question = questions.find((candidate) => candidate.id === item.questionId);
    if (!question) return finish("abstained", null, "question_not_found");
    if (question.type !== item.type) return finish("abstained", null, "type_mismatch");

    const reference = referenceForQuestion(question);
    if (!reference.hasReference) return finish("abstained", null, "reference_unavailable");

    const rubric = deps.rubricFor(item.type);
    const rubricVersion = rubric.version.trim() || RUBRIC_UNAVAILABLE_VERSION;

    const result = await deps.adapter.evaluate({
      type: item.type,
      questionId: item.questionId,
      response: item.response,
      mode: "practice",
      systemPrompt: composeJudgePrompt({
        ...(rubric.text.trim() ? { rubric: rubric.text } : {}),
        referenceSamples: reference.judgeReference,
      }),
      untrusted: withStudentResponse(reference.untrusted, responseTextOf(item.response)),
      rubricVersion,
      promptVersion: JUDGE_PROMPT_VERSION,
      referenceSamples: reference.protectedSamples,
      model: deps.model,
    });

    return finish(result.verdict, result.verdict === "scored" ? result.score : null);
  } catch (error) {
    return finish("needs_review", null, errorCodeOf(error) ?? "unexpected_error");
  }
}

/**
 * Executa a calibração dos tipos pedidos (ou de todos) e devolve apenas o DTO
 * serializável. Um item com exceção vira `needs_review`; o lote continua.
 */
export async function runCalibration(
  input: CalibrationRunInput,
  overrides: CalibrationDependencyOverrides = {},
): Promise<CalibrationReport> {
  const deps = await resolveDependencies(overrides);
  const types = resolveTypes(input);
  const outcomes: CalibrationOutcome[] = [];

  for (const type of types) {
    for (const item of itemsForType(type)) {
      outcomes.push(await evaluateItem(item, deps));
    }
  }

  return buildCalibrationReport(outcomes, {
    types,
    generatedAt: new Date(deps.nowMs()).toISOString(),
  });
}

/** Exposto para testes/consumidores que precisam do tamanho do corpus por tipo. */
export function calibrationCorpusSize(): number {
  return CALIBRATION_CORPUS.length;
}
