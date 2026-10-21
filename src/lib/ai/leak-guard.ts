/**
 * Guarda antivazamento do resultado de avaliação.
 *
 * Regra do produto (PRD central §4.4; PRD s1 §2.3): o navegador NUNCA recebe o
 * gabarito/transcrição reservada. Se o modelo ecoar um trecho reservado em qualquer
 * campo visível (feedback, incerteza, id/rótulo/justificativa de dimensão,
 * observação/quote/dimensionId de evidência, unmeasured ou motivo), o resultado é
 * retido como `needs_review`, perde a nota e TODO campo estrutural de texto do
 * modelo é descartado.
 *
 * Estratégia (auditoria s5 — G1/G2/G3; reabertura do monitor 2026-10-21):
 * - Amostras longas (≥ 25 chars) são detectadas por conteúdo literal E por sondas
 *   de 20 chars (passo 6), o que pega ecos parciais de referências longas.
 * - Amostras curtas (lacunas e respostas de uma palavra) são comparadas por
 *   FRASE INTEIRA com fronteira de palavra, evitando "art" dentro de "part".
 *   Essa varredura só é armada quando o chamador informa contexto (o adaptador
 *   sempre informa `{ type, studentResponse }`); chamadas legadas sem contexto
 *   preservam o piso histórico de 25 chars.
 * - Todos os campos textuais visíveis são vigiados: quando há vazamento, TODOS
 *   os campos estruturais de texto do modelo (dimensões, evidências, unmeasured)
 *   são descartados de uma vez — nunca é tentado preservar "partes limpas",
 *   porque o gabarito pode estar dividido ENTRE campos (metade numa
 *   justificativa, metade numa citação) e a reconstrução pelo aluno é exatamente
 *   o que a retenção existe para impedir. O payload retido tem apenas texto
 *   constante público, sem segredo.
 * - Fail-closed (reabertura do monitor): um campo INDIVIDUAL acima do teto de
 *   varredura OU a SOMA dos campos acima do teto retêm o resultado sem análise
 *   — nunca se devolve a cauda não varrida, nem substituindo a busca por
 *   truncamento.
 * - O conteúdo do aluno (`studentResponse`, opcional) só isenta um trecho quando
 *   o TRECHO INTEIRO já aparece na resposta dele — repetir o que o aluno escreveu
 *   não revela gabarito. Um termo solto nunca isenta uma referência longa.
 *
 * Cobertura das sondas (reabertura do monitor): com W=20 e S=6 qualquer eco
 * contíguo de N ≥ 25 chars normalizados contém pelo menos UMA janela-sonda
 * inteira (todo intervalo de 6 posições contém um múltiplo de 6), e o filtro
 * de distintividade foi removido — cada janela mantida é literal comparada
 * por `includes`. Consequência: cobertura UNIVERSAL de ecos ≥ 25 chars
 * (eco de 15 chars ou menos permanece permitido, como antes). O custo é
 * aceitar sondas genéricas: texto honesto do modelo que contenha por acaso
 * uma janela de 20 chars da referência vira revisão sem nota — orientação
 * conservadora intencional (falso positivo em revisão, nunca vazamento com
 * nota).
 *
 * Limitações declaradas:
 * - Paráfrase perfeita da referência (sem nenhum trecho literal comum) não é
 *   detectada por esta guarda determinística. A instrução do juiz continua sendo
 *   a barreira para esse caso.
 *
 * Módulo puro: zero I/O.
 */

import type { EvaluationResult, TaskType } from "@/domain";

/** Amostras abaixo deste tamanho são tratadas como "curtas" (frase inteira). */
export const MIN_LEAK_SAMPLE_LENGTH = 25;
/** Teto de varredura por campo (evita custo ilimitado com texto hostil). */
export const MAX_SCANNED_TEXT_LENGTH = 20_000;
/** Tamanho da sonda literal usada para detectar eco parcial de referência longa. */
export const LEAK_PROBE_LENGTH = 20;
/**
 * Passo entre sondas (W=20, S=6) — reabertura do monitor: com o passo 6, todo
 * intervalo de 6 posições contém um múltiplo de 6, portanto QUALQUER eco
 * contíguo com N ≥ 25 chars normalizados contém pelo menos uma janela-sonda
 * inteira. O filtro de distintividade foi removido (`isDistinctive` não
 * existe mais): cada janela mantida é comparada literalmente por `includes`,
 * restaurando a cobertura universal de ecos ≥ 25 chars. Eco de 15 chars ou
 * menos permanece permitido (nenhuma sonda de 20 chars cabe nele e o sample
 * inteiro também não). Efeito colateral aceito por política: uma janela de
 * 20 chars da referência que apareça por acaso em texto honesto do modelo
 * gera revisão sem nota — orientação conservadora (falso positivo em
 * revisão), nunca o contrário (vazamento com nota).
 */
export const LEAK_PROBE_STRIDE = 6;
export const LEAK_REVIEW_REASON = "resultado retido para revisão de segurança";
export const LEAK_SAFE_FEEDBACK = "Resultado retido para revisão de segurança.";

export interface LeakContext {
  /** Tipo da tarefa; habilita a varredura de amostras curtas no caminho real. */
  type?: TaskType;
  /** Resposta do aluno; isenta apenas trechos que ele já escreveu por inteiro. */
  studentResponse?: string;
}

interface PreparedSample {
  normalized: string;
  probes: string[];
  shortPhrase: boolean;
}

/**
 * Normaliza para comparação: minúsculas, pontuação vira espaço e espaços
 * colapsados. Assim caixa alta, pontuação e espaços duplos não driblam a guarda.
 */
function normalize(text: string): string {
  return text
    .slice(0, MAX_SCANNED_TEXT_LENGTH)
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sondas de `LEAK_PROBE_LENGTH` chars em passo fixo (inclui o sufixo). */
function probesOf(sample: string): string[] {
  const probes: string[] = [];
  for (let index = 0; index + LEAK_PROBE_LENGTH <= sample.length; index += LEAK_PROBE_STRIDE) {
    const probe = sample.slice(index, index + LEAK_PROBE_LENGTH).trim();
    if (probe.length >= 12) probes.push(probe);
  }
  const suffix = sample.slice(-LEAK_PROBE_LENGTH).trim();
  if (suffix.length >= 12) probes.push(suffix);
  return probes;
}

function prepareSamples(referenceSamples: readonly string[]): PreparedSample[] {
  const prepared: PreparedSample[] = [];
  for (const sample of referenceSamples) {
    const normalized = normalize(sample);
    if (normalized.length === 0) continue;
    const shortPhrase = normalized.length < MIN_LEAK_SAMPLE_LENGTH;
    prepared.push({
      normalized,
      probes: shortPhrase ? [] : probesOf(normalized),
      shortPhrase,
    });
  }
  return prepared;
}

/** Compara a amostra inteira delimitada por espaços (fronteira de palavra). */
function containsWordPhrase(haystack: string, phrase: string): boolean {
  if (phrase.length === 0) return false;
  return ` ${haystack} `.includes(` ${phrase} `);
}

/** `true` quando `text` (já normalizado) revela a amostra para quem não a escreveu. */
function sampleLeaks(text: string, sample: PreparedSample, student: string): boolean {
  if (sample.shortPhrase) {
    if (!containsWordPhrase(text, sample.normalized)) return false;
    return !containsWordPhrase(student, sample.normalized);
  }
  if (text.includes(sample.normalized)) {
    return !student.includes(sample.normalized);
  }
  return sample.probes.some((probe) => text.includes(probe) && !student.includes(probe));
}

function visibleTextsOf(result: EvaluationResult): string[] {
  const texts: string[] = [result.feedback, result.uncertainty ?? ""];
  for (const dimension of result.dimensions) {
    texts.push(dimension.id, dimension.label, dimension.rationale ?? "");
  }
  for (const evidence of result.evidence) {
    texts.push(evidence.observation, evidence.dimensionId ?? "", evidence.quote ?? "");
  }
  texts.push(...result.unmeasured);
  if (result.verdict === "abstained") texts.push(result.abstentionReason);
  if (result.verdict === "needs_review") texts.push(result.reviewReason);
  return texts.filter((text) => text.length > 0);
}

/**
 * `true` quando algum campo visível revela uma amostra reservada.
 * Sem contexto, amostras curtas não são vigiadas (compatibilidade do piso de 25);
 * no caminho real o adaptador sempre passa `{ type, studentResponse }`.
 */
export function leaksReference(
  result: EvaluationResult,
  referenceSamples: readonly string[],
  context?: LeakContext,
): boolean {
  const samples = prepareSamples(referenceSamples);
  if (samples.length === 0) return false;

  const fields = visibleTextsOf(result);
  // Fail-closed (reabertura do monitor): campo cuja extensão passa do teto de
  // varredura é retido SEM tentar truncar — a cauda não varrida de um campo
  // gigante pode esconder o eco, e o resultado retido não carrega texto do
  // modelo de qualquer forma.
  if (fields.some((field) => field.length > MAX_SCANNED_TEXT_LENGTH)) return true;
  // Fail-closed da SOMA BRUTA: muitos campos médios somam mais que o teto —
  // o `normalize` truncaria o conjunto (e o `joined` já vem truncado), então
  // a sobreposição não é analisada sem retenção.
  let fieldsTotal = 0;
  for (const field of fields) fieldsTotal += field.length;
  if (fieldsTotal > MAX_SCANNED_TEXT_LENGTH) return true;

  const armShortSamples = context !== undefined;
  const student = normalize(context?.studentResponse ?? "");
  const normalizedFields = fields.map(normalize);
  // Junta os campos para pegar vazamento dividido entre feedback e uncertainty.
  const joined = normalize(fields.join("\n"));

  return samples.some((sample) => {
    if (sample.shortPhrase && !armShortSamples) return false;
    return (
      normalizedFields.some((field) => sampleLeaks(field, sample, student)) ||
      sampleLeaks(joined, sample, student)
    );
  });
}

/**
 * Retém o resultado se houver vazamento. Nunca lança e nunca devolve `score`
 * quando retém. Política conservadora (reabertura do monitor): quando há
 * vazamento — em um campo individual OU apenas no conjunto de campos — TODOS
 * os campos estruturais de texto do modelo (dimensões, evidências, unmeasured,
 * rótulos e justificativas) são descartados por inteiro. Tentar preservar
 * "partes limpas" permite a reconstrução dividida do gabarito entre campos
 * (achado GRAVE da avaliação stage-05); o payload retido contém apenas texto
 * público constante sem segredo e o restante vai para revisão humana.
 */
export function sanitizeEvaluationResult(
  result: EvaluationResult,
  referenceSamples: readonly string[],
  context?: LeakContext,
): EvaluationResult {
  if (!leaksReference(result, referenceSamples, context)) return result;

  return {
    scale: result.scale,
    verdict: "needs_review",
    score: null,
    confidence: result.confidence,
    dimensions: [],
    evidence: [],
    feedback: LEAK_SAFE_FEEDBACK,
    uncertainty: null,
    unmeasured: [],
    evaluator: result.evaluator,
    scoredAt: result.scoredAt,
    reviewReason: LEAK_REVIEW_REASON,
  };
}
