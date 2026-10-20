/**
 * Orquestração servidor-side com o banco real: referência reservada nunca sai,
 * questão ausente abstém, e o resultado passa pelo leak-guard do adaptador.
 */

import { loadQuestionsByType } from "@/data/loader";
import { ATTEMPT_SCORE_SCALE, type ScoredEvaluationResult } from "@/domain";
import { createEvaluationAdapter } from "@/lib/ai/adapter.server";
import { createEvaluationHandler } from "@/lib/ai/evaluate-handler";
import type { EvaluationRequestPayload } from "@/lib/ai/evaluation-io";

interface CallInput {
  systemPrompt: string;
  untrusted: { label: string; content: string }[];
  rubricVersion: string;
  promptVersion: string;
}

const RESERVED = "Scientists are discovering new links between genes and diseases.";

function scored(overrides: Partial<ScoredEvaluationResult> = {}): ScoredEvaluationResult {
  return {
    scale: ATTEMPT_SCORE_SCALE,
    verdict: "scored",
    score: 68,
    confidence: "medium",
    dimensions: [
      {
        id: "content",
        label: "Conteúdo",
        status: "measured",
        score: 68,
        rationale: "Ideias principais preservadas.",
      },
    ],
    evidence: [{ observation: "O aluno cita genes e doenças.", dimensionId: "content" }],
    feedback: "Boa compreensão; atenção à ordem das palavras.",
    uncertainty: null,
    unmeasured: [],
    evaluator: { model: "fake", promptVersion: "prompt@1", rubricVersion: "rubric@1" },
    scoredAt: "2026-10-20T12:00:00.000Z",
    ...overrides,
  };
}

function payload(overrides: Partial<EvaluationRequestPayload> = {}): EvaluationRequestPayload {
  return {
    type: "wfd",
    questionId: "goarno-wfd-001",
    response: { text: "Scientists find new links between genes and diseases." },
    mode: "practice",
    ...overrides,
  };
}

describe("createEvaluationHandler — referência e contrato", () => {
  it("envia a referência no system e nunca no conteúdo do aluno", async () => {
    let captured: CallInput | undefined;
    const adapter = createEvaluationAdapter({
      callModel: async (call) => {
        captured = call;
        return scored();
      },
      log: () => undefined,
    });
    const handler = createEvaluationHandler({ adapter, loadQuestionsByType });

    const response = await handler(payload());

    expect(response.evaluation.verdict).toBe("scored");
    expect(captured?.systemPrompt).toContain(RESERVED);
    const untrustedText = (captured?.untrusted ?? []).map((part) => part.content).join("\n");
    expect(untrustedText).not.toContain(RESERVED);
    expect(untrustedText).toContain("Scientists find new links");
  });

  it("retém o resultado quando o avaliador vaza a referência", async () => {
    const adapter = createEvaluationAdapter({
      callModel: async () => scored({ feedback: `A frase correta é ${RESERVED}` }),
      log: () => undefined,
    });
    const handler = createEvaluationHandler({ adapter, loadQuestionsByType });

    const response = await handler(payload());

    expect(response.evaluation.verdict).toBe("needs_review");
    expect(response.evaluation.score).toBeNull();
    if (response.evaluation.verdict === "needs_review") {
      expect(response.evaluation.reviewReason).toBe("resultado retido para revisão de segurança");
    }
  });

  it("abstém sem chamar o modelo quando a questão não existe", async () => {
    let calls = 0;
    const adapter = createEvaluationAdapter({
      callModel: async () => {
        calls += 1;
        return scored();
      },
      log: () => undefined,
    });
    const handler = createEvaluationHandler({ adapter, loadQuestionsByType });

    const response = await handler(payload({ questionId: "goarno-wfd-999999" }));

    expect(calls).toBe(0);
    expect(response.evaluation.verdict).toBe("abstained");
    expect(response.evaluation.score).toBeNull();
    if (response.evaluation.verdict === "abstained") {
      expect(response.evaluation.abstentionReason).toContain("não encontrada");
    }
  });

  it("abstém quando o id não pertence ao tipo informado", async () => {
    let calls = 0;
    const adapter = createEvaluationAdapter({
      callModel: async () => {
        calls += 1;
        return scored();
      },
      log: () => undefined,
    });
    const handler = createEvaluationHandler({ adapter, loadQuestionsByType });

    const response = await handler(payload({ type: "read_aloud" }));

    expect(calls).toBe(0);
    expect(response.evaluation.verdict).toBe("abstained");
  });

  it("abstém quando o carregamento do banco falha", async () => {
    const adapter = createEvaluationAdapter({
      callModel: async () => scored(),
      log: () => undefined,
    });
    const handler = createEvaluationHandler({
      adapter,
      loadQuestionsByType: async () => {
        throw new Error("falha de leitura");
      },
    });

    const response = await handler(payload());

    expect(response.evaluation.verdict).toBe("needs_review");
    expect(response.evaluation.score).toBeNull();
  });

  it("aceita rubrica injetada e carimba a versão no resultado", async () => {
    let captured: CallInput | undefined;
    const adapter = createEvaluationAdapter({
      callModel: async (call) => {
        captured = call;
        return scored();
      },
      log: () => undefined,
    });
    const handler = createEvaluationHandler({
      adapter,
      loadQuestionsByType,
      rubricFor: () => ({ text: "RUBRICA WFD", version: "wfd@1" }),
    });

    const response = await handler(payload());

    expect(captured?.systemPrompt).toContain("RUBRICA WFD");
    expect(captured?.rubricVersion).toBe("wfd@1");
    expect(response.evaluation.evaluator.rubricVersion).toBe("wfd@1");
  });
});
