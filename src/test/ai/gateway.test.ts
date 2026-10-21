/**
 * Regressão de integração do gateway: SDK real + `fetch` fake.
 *
 * O bug medido no smoke da s4 (`AI_InvalidPromptError`: "System messages are not
 * allowed in the prompt or messages fields. Use the instructions option instead.")
 * não era pego por testes com adaptador fake, porque eles nunca montavam o prompt
 * do SDK. Aqui a chamada real (`createGatewayEvaluationCall`) usa o provider e o
 * `streamText` instalados, e um `fetch` capturado inspeciona o request de wire:
 * política em `instructions`, `messages` sem `system`, schema estrito e as opções
 * de reasoning/store preservadas. Nenhuma rede, nenhuma credencial real.
 */

import { ATTEMPT_SCORE_SCALE } from "@/domain";
import { EvaluationOutputError, MissingApiKeyError } from "@/lib/ai/errors";
import {
  createGatewayEvaluationCall,
  judgeOutputSchema,
} from "@/lib/ai/gateway/evaluate-call.server";
import { UNTRUSTED_RULE } from "@/lib/ai/prompt-injection";

const DUMMY_API_KEY = "test-key-not-a-credential";
const SYSTEM_PROMPT = "POLÍTICA DO JUIZ DE TESTE\nAvalie apenas o que é observável.";
const STUDENT_ANSWER = "Scientists find new links between genes and diseases.";

const JUDGE_OUTPUT = {
  verdict: "scored",
  score: 74,
  confidence: "medium",
  dimensions: [
    {
      id: "content",
      label: "Conteúdo",
      status: "measured",
      score: 74,
      rationale: "Preserva as ideias principais.",
    },
  ],
  evidence: [
    { observation: "O aluno menciona genes e doenças.", dimensionId: "content", quote: null },
  ],
  feedback: "Bom domínio do conteúdo.",
  uncertainty: null,
  unmeasured: [],
  abstentionReason: null,
  reviewReason: null,
} as const;

interface WireSchema {
  type?: string;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, WireSchema>;
  items?: WireSchema;
}

interface WireInputItem {
  role?: string;
  content?: unknown;
}

interface WireBody {
  model?: string;
  input?: WireInputItem[];
  instructions?: string;
  stream?: boolean;
  store?: boolean;
  include?: string[];
  reasoning?: { effort?: string; summary?: string };
  text?: { format?: { type?: string; strict?: boolean; schema?: WireSchema } };
}

interface CapturedRequest {
  url: string;
  headers: Headers;
  body: WireBody;
}

/** Conteúdo textual de um item de `input[]` (string ou partes `input_text`). */
function itemText(item: WireInputItem): string {
  if (typeof item.content === "string") return item.content;
  if (!Array.isArray(item.content)) return "";
  return item.content
    .map((part) => {
      if (typeof part !== "object" || part === null) return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("\n");
}

/** SSE mínimo e válido da Responses API, com o JSON final como texto. */
function responsesSse(text: string | null): string {
  const events: unknown[] = [
    {
      type: "response.created",
      response: { id: "resp_test", created_at: 1, model: "openai/gpt-6-astra" },
    },
  ];
  if (text !== null) {
    events.push(
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "message", id: "msg_1" },
      },
      { type: "response.output_text.delta", item_id: "msg_1", output_index: 0, delta: text },
      {
        type: "response.output_item.done",
        output_index: 0,
        item: {
          type: "message",
          id: "msg_1",
          content: [{ type: "output_text", text, annotations: [] }],
        },
      },
    );
  }
  events.push({
    type: "response.completed",
    response: {
      incomplete_details: null,
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      service_tier: null,
    },
  });

  return events
    .map(
      (event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    .join("");
}

let captured: CapturedRequest[] = [];

function stubGatewayFetch(text: string | null): void {
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const rawBody = typeof init?.body === "string" ? init.body : "{}";
      captured.push({
        url,
        headers: new Headers(init?.headers),
        body: JSON.parse(rawBody) as WireBody,
      });
      return new Response(responsesSse(text), {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-lovable-aig-run-id": "run-test",
        },
      });
    },
  );
}

function evaluate(overrides: { systemPrompt?: string } = {}) {
  const call = createGatewayEvaluationCall({ model: "openai/test-model" });
  return call({
    systemPrompt: overrides.systemPrompt ?? SYSTEM_PROMPT,
    untrusted: [
      { label: "QUESTAO", content: "Write from dictation." },
      { label: "RESPOSTA_DO_ALUNO", content: STUDENT_ANSWER },
    ],
    promptVersion: "prompt@test",
    rubricVersion: "rubric@test",
    model: "openai/test-model",
  });
}

beforeEach(() => {
  captured = [];
  vi.stubEnv("LOVABLE_API_KEY", DUMMY_API_KEY);
  vi.stubEnv("LOVABLE_AI_GATEWAY_URL", "");
  vi.stubEnv("LOVABLE_AI_EVALUATION_MODEL", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  captured = [];
});

describe("gateway — request de wire com o SDK 7 instalado", () => {
  it("envia um único request com a política em instructions e sem system nas mensagens", async () => {
    stubGatewayFetch(JSON.stringify(JUDGE_OUTPUT));

    await evaluate();

    expect(captured).toHaveLength(1);
    const request = captured[0];
    // `expect().toHaveLength` não estreita tipos: o guard explícito é o que
    // garante a compilação sem non-null assertion.
    if (!request) throw new Error("o fetch fake não registrou nenhum request");
    expect(request.url).toBe("https://ai.gateway.lovable.dev/v1/responses");
    expect(request.headers.get("Lovable-API-Key")).toBe(DUMMY_API_KEY);

    const input = request.body.input ?? [];
    expect(input.length).toBeGreaterThanOrEqual(2);

    // A política viaja em um turno confiável (developer/system), nunca como
    // mensagem do aluno. Exatamente uma ocorrência evita prompt duplicado.
    const withPolicy = input.filter((item) => itemText(item).includes(SYSTEM_PROMPT));
    expect(withPolicy).toHaveLength(1);
    expect(["system", "developer"]).toContain(withPolicy[0]?.role);
    expect(itemText(withPolicy[0] as WireInputItem)).toContain(UNTRUSTED_RULE);

    // Responses usa `input[]`; não existe campo `messages` com system indevido.
    expect(request.body).not.toHaveProperty("messages");
    expect(input.some((item) => item.role === "system")).toBe(false);

    const userItems = input.filter((item) => item.role === "user");
    expect(userItems).toHaveLength(1);
    const userText = itemText(userItems[0] as WireInputItem);
    expect(userText).toContain("<<<RESPOSTA_DO_ALUNO>>>");
    expect(userText).toContain(STUDENT_ANSWER);
    expect(userText).toContain("<<<QUESTAO>>>");
    expect(userText).not.toContain(SYSTEM_PROMPT);
  });

  it("preserva modelo, Responses/stream, store:false e as cinco opções de reasoning", async () => {
    stubGatewayFetch(JSON.stringify(JUDGE_OUTPUT));

    await evaluate();

    const body = captured[0]?.body;
    expect(body?.model).toBe("openai/test-model");
    expect(body?.stream).toBe(true);
    expect(body?.store).toBe(false);
    expect(body?.reasoning).toEqual({ effort: "medium", summary: "auto" });
    expect(body?.include).toContain("reasoning.encrypted_content");
  });

  it("emite schema estrito com objeto raiz, required completo e additionalProperties false", async () => {
    stubGatewayFetch(JSON.stringify(JUDGE_OUTPUT));

    await evaluate();

    const format = captured[0]?.body.text?.format;
    expect(format?.type).toBe("json_schema");
    expect(format?.strict).toBe(true);

    const schema = format?.schema;
    expect(schema?.type).toBe("object");
    expect(schema?.additionalProperties).toBe(false);
    expect([...(schema?.required ?? [])].sort()).toEqual(
      Object.keys(judgeOutputSchema.shape).sort(),
    );

    const dimensions = schema?.properties?.["dimensions"]?.items;
    expect(dimensions?.type).toBe("object");
    expect(dimensions?.additionalProperties).toBe(false);
    expect([...(dimensions?.required ?? [])].sort()).toEqual([
      "id",
      "label",
      "rationale",
      "score",
      "status",
    ]);

    const evidence = schema?.properties?.["evidence"]?.items;
    expect(evidence?.additionalProperties).toBe(false);
    expect([...(evidence?.required ?? [])].sort()).toEqual(["dimensionId", "observation", "quote"]);
  });

  it("normaliza a saída do modelo para o contrato de domínio e carimba identidade", async () => {
    stubGatewayFetch(JSON.stringify(JUDGE_OUTPUT));

    const result = await evaluate();

    expect(result).toMatchObject({
      scale: ATTEMPT_SCORE_SCALE,
      verdict: "scored",
      score: 74,
      confidence: "medium",
      feedback: "Bom domínio do conteúdo.",
      evaluator: {
        model: "openai/test-model",
        promptVersion: "prompt@test",
        rubricVersion: "rubric@test",
      },
    });
    expect(Number.isNaN(Date.parse(result.scoredAt))).toBe(false);
    expect(result.dimensions[0]?.rationale).toBe("Preserva as ideias principais.");
    // `quote: null` não vira string vazia nem é propagado como campo opcional.
    expect(result.evidence[0]).toEqual({
      observation: "O aluno menciona genes e doenças.",
      dimensionId: "content",
    });
  });

  it("saída vazia não vira nota: falha como EvaluationOutputError", async () => {
    stubGatewayFetch(null);

    await expect(evaluate()).rejects.toBeInstanceOf(EvaluationOutputError);
  });

  it("sem LOVABLE_API_KEY não faz request e falha como MissingApiKeyError", async () => {
    stubGatewayFetch(JSON.stringify(JUDGE_OUTPUT));
    vi.stubEnv("LOVABLE_API_KEY", "");

    await expect(evaluate()).rejects.toBeInstanceOf(MissingApiKeyError);
    expect(captured).toHaveLength(0);
  });
});
