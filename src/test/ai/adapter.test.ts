/**
 * Adaptador: limites, cache, retry restrito e tradução de falhas.
 * O modelo é sempre um fake injetado — nenhuma chamada real ao gateway.
 */

import { ATTEMPT_SCORE_SCALE, type ScoredEvaluationResult } from "@/domain";
import {
  DEFAULT_EVALUATION_MODEL,
  createEvaluationAdapter,
  validateEvaluationInput,
  type EvaluateInput,
  type EvaluationLogEntry,
} from "@/lib/ai/adapter.server";

const RESERVED = "Scientists are discovering new links between genes and diseases.";

function scored(overrides: Partial<ScoredEvaluationResult> = {}): ScoredEvaluationResult {
  return {
    scale: ATTEMPT_SCORE_SCALE,
    verdict: "scored",
    score: 74,
    confidence: "medium",
    dimensions: [
      {
        id: "content",
        label: "Conteúdo",
        status: "measured",
        score: 74,
        rationale: "A resposta preserva as ideias principais.",
      },
    ],
    evidence: [{ observation: "O aluno menciona genes e doenças.", dimensionId: "content" }],
    feedback: "Bom domínio do conteúdo.",
    uncertainty: null,
    unmeasured: [],
    evaluator: { model: "fake", promptVersion: "prompt@1", rubricVersion: "rubric@1" },
    scoredAt: "2026-10-20T12:00:00.000Z",
    ...overrides,
  };
}

function input(overrides: Partial<EvaluateInput> = {}): EvaluateInput {
  return {
    type: "wfd",
    questionId: "goarno-wfd-001",
    response: { text: "Scientists find new links between genes and diseases." },
    mode: "practice",
    systemPrompt: "política de teste",
    untrusted: [{ label: "RESPOSTA_DO_ALUNO", content: "resposta do aluno" }],
    rubricVersion: "rubric@1",
    promptVersion: "prompt@1",
    referenceSamples: [RESERVED],
    ...overrides,
  };
}

function httpError(statusCode: number): Error {
  return Object.assign(new Error(`HTTP ${String(statusCode)}`), { statusCode });
}

describe("validateEvaluationInput", () => {
  it("aceita um payload dentro dos limites", () => {
    expect(validateEvaluationInput(input())).toEqual({ ok: true });
  });

  it("rejeita resposta vazia/whitespace", () => {
    expect(validateEvaluationInput(input({ response: { text: "   " } }))).toEqual({
      ok: false,
      reason: "resposta vazia",
    });
  });

  it("rejeita texto acima de 20 000 caracteres", () => {
    expect(validateEvaluationInput(input({ response: { text: "a".repeat(20_001) } }))).toEqual({
      ok: false,
      reason: "resposta acima do limite de tamanho",
    });
  });

  it("rejeita questionId com caractere inválido", () => {
    expect(validateEvaluationInput(input({ questionId: "id com espaço" }))).toEqual({
      ok: false,
      reason: "identificador de questão inválido",
    });
  });
});

describe("createEvaluationAdapter — honestidade e limites", () => {
  it("devolve abstenção sem chamar o modelo quando a entrada é inválida", async () => {
    let calls = 0;
    const adapter = createEvaluationAdapter({
      callModel: async () => {
        calls += 1;
        return scored();
      },
      log: () => undefined,
    });

    const result = await adapter.evaluate(input({ response: { text: " " } }));

    expect(calls).toBe(0);
    expect(result.verdict).toBe("abstained");
    expect(result.score).toBeNull();
  });

  it("usa a identidade default e o modelo configurado", async () => {
    let observedModel = "";
    const adapter = createEvaluationAdapter({
      callModel: async (call) => {
        observedModel = call.model ?? "";
        return scored();
      },
      log: () => undefined,
    });

    const result = await adapter.evaluate(input({ model: "openai/test-model" }));

    expect(observedModel).toBe("openai/test-model");
    expect(result.evaluator.model).toBe("openai/test-model");
  });

  it("cai para o modelo default quando nenhum é informado", async () => {
    const adapter = createEvaluationAdapter({
      callModel: async () => scored(),
      log: () => undefined,
    });

    const result = await adapter.evaluate(input());
    expect(result.evaluator.model).toBe(DEFAULT_EVALUATION_MODEL);
  });

  it("retenta 429 até 2 vezes e respeita o backoff exponencial", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const adapter = createEvaluationAdapter({
      callModel: async () => {
        calls += 1;
        if (calls < 3) throw httpError(429);
        return scored();
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
      log: () => undefined,
    });

    const result = await adapter.evaluate(input());

    expect(calls).toBe(3);
    expect(sleeps).toEqual([500, 1000]);
    expect(result.verdict).toBe("scored");
  });

  it("esgota 5xx em 3 chamadas e devolve needs_review sem nota", async () => {
    let calls = 0;
    const adapter = createEvaluationAdapter({
      callModel: async () => {
        calls += 1;
        throw httpError(503);
      },
      sleep: async () => undefined,
      random: () => 0,
      log: () => undefined,
    });

    const result = await adapter.evaluate(input());

    expect(calls).toBe(3);
    expect(result.verdict).toBe("needs_review");
    expect(result.score).toBeNull();
  });

  it("não retenta 400 (erro de entrada)", async () => {
    let calls = 0;
    const adapter = createEvaluationAdapter({
      callModel: async () => {
        calls += 1;
        throw httpError(400);
      },
      sleep: async () => undefined,
      log: () => undefined,
    });

    const result = await adapter.evaluate(input());

    expect(calls).toBe(1);
    expect(result.verdict).toBe("needs_review");
    expect(result.score).toBeNull();
  });

  it("401 vira needs_review e abort vira abstenção", async () => {
    const adapter = createEvaluationAdapter({
      callModel: async () => {
        throw httpError(401);
      },
      log: () => undefined,
    });
    const unauthorized = await adapter.evaluate(input());
    expect(unauthorized.verdict).toBe("needs_review");
    expect(unauthorized.score).toBeNull();

    const aborted = createEvaluationAdapter({
      callModel: async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      },
      log: () => undefined,
    });
    const abortedResult = await aborted.evaluate(input());
    expect(abortedResult.verdict).toBe("abstained");
    expect(abortedResult.score).toBeNull();
  });

  it("rejeita nota fora do contrato e devolve needs_review", async () => {
    const adapter = createEvaluationAdapter({
      callModel: async () => scored({ score: 180 }),
      log: () => undefined,
    });

    const result = await adapter.evaluate(input());
    expect(result.verdict).toBe("needs_review");
    expect(result.score).toBeNull();
  });

  it("faz cache por resposta e evita segunda chamada ao modelo", async () => {
    let calls = 0;
    const logs: EvaluationLogEntry[] = [];
    const adapter = createEvaluationAdapter({
      callModel: async () => {
        calls += 1;
        return scored();
      },
      log: (entry) => logs.push(entry),
    });

    const first = await adapter.evaluate(input());
    const second = await adapter.evaluate(input());

    expect(calls).toBe(1);
    expect(second).toEqual(first);
    expect(logs.at(-1)?.outcome).toBe("cache_hit");
  });

  it("expira o cache após 10 minutos", async () => {
    let calls = 0;
    let now = 1_000;
    const adapter = createEvaluationAdapter({
      callModel: async () => {
        calls += 1;
        return scored();
      },
      nowMs: () => now,
      log: () => undefined,
    });

    await adapter.evaluate(input());
    now += 10 * 60 * 1000;
    await adapter.evaluate(input());

    expect(calls).toBe(2);
  });

  it("retém resultado que ecoa referência reservada", async () => {
    const adapter = createEvaluationAdapter({
      callModel: async () => scored({ feedback: `A frase é: ${RESERVED}` }),
      log: () => undefined,
    });

    const result = await adapter.evaluate(input());

    expect(result.verdict).toBe("needs_review");
    expect(result.score).toBeNull();
    expect(result.feedback).not.toContain(RESERVED);
  });

  it("registra apenas campos estruturais no log", async () => {
    const logs: EvaluationLogEntry[] = [];
    const adapter = createEvaluationAdapter({
      callModel: async () => scored(),
      log: (entry) => logs.push(entry),
    });

    await adapter.evaluate(input());

    const entry = logs[0];
    expect(entry?.kind).toBe("evaluation");
    expect(entry?.type).toBe("wfd");
    expect(entry?.questionId).toBe("goarno-wfd-001");
    expect(Object.keys(entry ?? {}).sort()).toEqual(
      ["attempt", "durationMs", "kind", "model", "outcome", "questionId", "type"].sort(),
    );
  });
});
