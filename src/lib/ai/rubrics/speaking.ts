/**
 * Rubricas de Speaking (7 tipos) — Fase 5, s2-rubricas.
 *
 * Base normativa: `src/data/exam-spec.ts` (critérios por tarefa) e PRD §17.
 * Honestidade obrigatória desta família:
 * - `pronunciation` é `not_measured` em TODOS os 7 tipos: sem análise real de
 *   áudio não existe medida de pronúncia, e o prompt proíbe inferi-la do texto.
 * - `oral_fluency` é `proxy` (transcrição), nunca prosódia.
 * - `answer_short` avalia apenas conteúdo/vocabulário: uma palavra correta basta
 *   e não há dimensão de fala pontuada.
 *
 * Módulo puro: zero I/O.
 */

import type { TypeRubric } from "./types";
import { inputLimitsFor } from "./exam-derived";
import {
  RUBRIC_VERSION,
  SPEAKING_ABSTENTIONS,
  SPEAKING_CAVEATS,
  contentDimension,
  fluencyProxyDimension,
  pronunciationDimension,
} from "./shared";

const RESERVED_REFERENCE =
  "A transcrição/texto de referência é fonte reservada de comparação para o juiz. Nunca é correção mecânica nem texto a copiar: o feedback e as evidências não podem revelá-la antes do momento seguro.";

export const SPEAKING_RUBRICS: readonly TypeRubric[] = [
  {
    type: "read_aloud",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      contentDimension(
        0.4,
        "Compare what the student actually read aloud (transcript) with the reference text: count omissions, insertions and repeated words. Do not reward speed; a natural self-correction that keeps the text intact does not count as an error.",
      ),
      fluencyProxyDimension(0.35),
      pronunciationDimension(0.25),
    ],
    abstentionRules: [...SPEAKING_ABSTENTIONS],
    inputLimits: inputLimitsFor("read_aloud"),
    referenceUsage: RESERVED_REFERENCE,
    caveats: [
      ...SPEAKING_CAVEATS,
      "Read Aloud é marcado como aproximação no exam-spec: a página de formato cita reading/speaking/pronunciation/oral fluency e a tabela do Score Guide lista apenas Speaking; a matriz adotada é speaking+reading.",
      "A habilidade Reading é refletida pela dimensão content (fidelidade ao texto lido), não por uma dimensão separada.",
    ],
  },
  {
    type: "repeat_sentence",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      contentDimension(
        0.45,
        "Compare the repeated sentence with the reference transcript: penalize omitted, added and substituted words, and repeated fragments. Word order matters for content.",
      ),
      fluencyProxyDimension(0.3),
      pronunciationDimension(0.25),
    ],
    abstentionRules: [
      ...SPEAKING_ABSTENTIONS,
      "Áudio da frase não reproduzido ou resposta que não tenta repetir a frase: abster em vez de pontuar conteúdo inexistente.",
    ],
    inputLimits: inputLimitsFor("repeat_sentence"),
    referenceUsage: RESERVED_REFERENCE,
    caveats: [...SPEAKING_CAVEATS],
  },
  {
    type: "describe_image",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      contentDimension(
        0.4,
        "Judge whether the response covers the image's main facts, trends, comparisons or process steps recorded in the reference (facts/keywords), with a coherent organization. Penalize invented data and claims that contradict the image.",
      ),
      fluencyProxyDimension(0.35),
      pronunciationDimension(0.25),
    ],
    abstentionRules: [
      ...SPEAKING_ABSTENTIONS,
      "Referência da imagem (fatos/palavras-chave) ausente no servidor: abster; sem referência não há como comparar conteúdo.",
    ],
    inputLimits: inputLimitsFor("describe_image"),
    referenceUsage:
      "Os fatos e palavras-chave da imagem são referência reservada do juiz. A descrição alternativa visível ao aluno não substitui essa referência e nunca deve ser copiada para o feedback.",
    caveats: [...SPEAKING_CAVEATS],
  },
  {
    type: "retell_lecture",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      contentDimension(
        0.4,
        "Judge coverage of the lecture's main points, the relations between them and its conclusion, against the reference transcript/keywords. Penalize invented content and disconnected details.",
      ),
      fluencyProxyDimension(0.35),
      pronunciationDimension(0.25),
    ],
    abstentionRules: [...SPEAKING_ABSTENTIONS],
    inputLimits: inputLimitsFor("retell_lecture"),
    referenceUsage: RESERVED_REFERENCE,
    caveats: [...SPEAKING_CAVEATS],
  },
  {
    type: "answer_short",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      contentDimension(
        1,
        "Judge whether the spoken answer (available as transcript) supplies the requested word or short phrase. A single-word answer is valid when correct; accept synonyms and equivalent short answers; do not require a complete sentence and do not judge delivery.",
      ),
    ],
    abstentionRules: [
      ...SPEAKING_ABSTENTIONS,
      "Pergunta não respondida ou resposta sem relação com o conceito pedido: abster; não transformar ausência de resposta em zero.",
    ],
    inputLimits: inputLimitsFor("answer_short"),
    referenceUsage:
      "A resposta esperada (gabarito) é referência reservada do juiz para comparar sentido e aceitar sinônimos; não é correção de string exata.",
    caveats: [
      "Pesos aproximados: a tarefa oficial pontua compreensão auditiva (traço Vocabulary); esta rubrica tem apenas a dimensão de conteúdo.",
      "A tarefa é falada, mas a rubrica não inclui dimensões de áudio: sem análise real de fala, nada de pronúncia ou fluência entra na nota.",
      "Uma palavra correta é uma resposta válida; não exija frase completa.",
      "Toda nota é uma estimativa de treino na escala 0–100, não a nota oficial do PTE Academic.",
    ],
  },
  {
    type: "sgd",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      contentDimension(
        0.4,
        "Summarize the group discussion: cover the positions of the speakers, points of agreement and disagreement, and the conclusion, against the reference transcript/keywords. Do not invent speakers or claims.",
      ),
      fluencyProxyDimension(0.35),
      pronunciationDimension(0.25),
    ],
    abstentionRules: [
      ...SPEAKING_ABSTENTIONS,
      "Resposta que ignora a discussão e fala de outro assunto: abster; não pontuar como resumo do que não foi resumido.",
    ],
    inputLimits: inputLimitsFor("sgd"),
    referenceUsage: RESERVED_REFERENCE,
    caveats: [...SPEAKING_CAVEATS],
  },
  {
    type: "rts",
    rubricVersion: RUBRIC_VERSION,
    dimensions: [
      contentDimension(
        0.4,
        "Judge whether the response addresses the situation with an appropriate, coherent and sufficiently specific reply. Penalize replies that ignore the request, contradict the situation or answer a different question.",
      ),
      fluencyProxyDimension(0.35),
      pronunciationDimension(0.25),
    ],
    abstentionRules: [
      ...SPEAKING_ABSTENTIONS,
      "Resposta que não se dirige à situação proposta (ex.: descreve a situação em vez de respondê-la): abster em vez de atribuir nota baixa por conteúdo ausente.",
    ],
    inputLimits: inputLimitsFor("rts"),
    referenceUsage:
      "O texto/áudio da situação e a resposta esperada são referência reservada do juiz para julgar adequação; não são resposta-modelo a copiar no feedback.",
    caveats: [...SPEAKING_CAVEATS],
  },
];
