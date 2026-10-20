/**
 * Contrato de questão — espelha o banco (`pte-question-bank/schema/question-types.d.ts`).
 *
 * Fonte de verdade do CONTEÚDO: o schema do banco (d.ts). Quando o PRD central e o
 * d.ts divergem, o d.ts vence (é o contrato real do pacote de 2.823 itens).
 *
 * Duas camadas, de propósito:
 * - `RawQuestion` = forma exata armazenada em `questions/<tipo>.json` (o que o
 *   pacote entrega). Nada de campos derivados gravados — payload enxuto.
 * - `Question` = forma usada pela aplicação: mesma coisa + `section` e `canonicalId`
 *   derivados em tempo de carga (`parseQuestion`), nunca persistidos no banco.
 *
 * Consumidores: Fase 2 (importador/manifesto), Fase 4 (catálogo), Fase 5 (harness de
 * avaliação recebe `data` + referência), Fase 6 (motores por tipo), Fase 11
 * (proveniência/`canonicalId`). Módulo puro: zero I/O.
 */

export const SECTIONS = ["speaking", "writing", "reading", "listening"] as const;
export type Section = (typeof SECTIONS)[number];

/** Os 22 tipos de tarefa pontuados do formato vigente (desde 07/08/2025). */
export const TASK_TYPES = [
  // Speaking (7)
  "read_aloud",
  "repeat_sentence",
  "describe_image",
  "retell_lecture",
  "answer_short",
  "sgd",
  "rts",
  // Writing (2)
  "swt",
  "write_essay",
  // Reading (5)
  "read_fib_dropdown",
  "read_mcq_multi",
  "reorder_paragraphs",
  "read_fib_drag",
  "read_mcq_single",
  // Listening (8)
  "sst",
  "lst_mcq_multi",
  "lst_fib",
  "lst_hcs",
  "lst_mcq_single",
  "lst_smw",
  "lst_hiw",
  "wfd",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/**
 * `verificada` = fonte oficial ou pontuação de fonte >= 80
 * `corroborada` = mesmo item em >= 2 fontes de operadores independentes
 * `comunitaria` = fonte de preparo com curadoria, sem corroboração
 */
export const PROVENANCES = ["verificada", "corroborada", "comunitaria"] as const;
export type Provenance = (typeof PROVENANCES)[number];

/** Seção de exame de cada tipo — invariante estrutural do catálogo (project1 §4). */
export const SECTION_BY_TYPE: Record<TaskType, Section> = {
  read_aloud: "speaking",
  repeat_sentence: "speaking",
  describe_image: "speaking",
  retell_lecture: "speaking",
  answer_short: "speaking",
  sgd: "speaking",
  rts: "speaking",
  swt: "writing",
  write_essay: "writing",
  read_fib_dropdown: "reading",
  read_mcq_multi: "reading",
  reorder_paragraphs: "reading",
  read_fib_drag: "reading",
  read_mcq_single: "reading",
  sst: "listening",
  lst_mcq_multi: "listening",
  lst_fib: "listening",
  lst_hcs: "listening",
  lst_mcq_single: "listening",
  lst_smw: "listening",
  lst_hiw: "listening",
  wfd: "listening",
};

/** Tipos agrupados por seção, derivado de `SECTION_BY_TYPE`. */
export const TASK_TYPES_BY_SECTION: Record<Section, readonly TaskType[]> = {
  speaking: TASK_TYPES.filter((type) => SECTION_BY_TYPE[type] === "speaking"),
  writing: TASK_TYPES.filter((type) => SECTION_BY_TYPE[type] === "writing"),
  reading: TASK_TYPES.filter((type) => SECTION_BY_TYPE[type] === "reading"),
  listening: TASK_TYPES.filter((type) => SECTION_BY_TYPE[type] === "listening"),
};

export function sectionOf(type: TaskType): Section {
  return SECTION_BY_TYPE[type];
}

export function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && (TASK_TYPES as readonly string[]).includes(value);
}

export function isSection(value: unknown): value is Section {
  return typeof value === "string" && (SECTIONS as readonly string[]).includes(value);
}

export function isProvenance(value: unknown): value is Provenance {
  return typeof value === "string" && (PROVENANCES as readonly string[]).includes(value);
}

/** Referência de fonte (`sources/sources.json` do pacote). */
export interface SourceRef {
  /** chave em `sources/sources.json` */
  id: string;
  domain: string;
  url?: string;
  /** obrigatório em `describe_image` (licença da imagem) */
  license?: string;
  attribution?: string;
}

/** Campos exatamente como armazenados no banco. */
export interface RawQuestionBase {
  /** estável e único; nunca reutilizado */
  id: string;
  type: TaskType;
  topic?: string;
  source: SourceRef;
  provenance: Provenance;
  /** ex.: "confirmado por 3 fontes independentes" */
  evidenceSummary?: string;
}

/** Campos usados pela aplicação (inclui os derivados em tempo de carga). */
export interface QuestionBase extends RawQuestionBase {
  /** derivado de `type` — nunca gravado no banco */
  section: Section;
  /**
   * Identidade estatística: quase-duplicatas compartilham o mesmo `canonicalId`
   * para não dividirem métrica (PRD §6.1/§11). Deriva de `id` quando o banco não
   * traz um (hoje `aliases.json` está vazio).
   */
  canonicalId: string;
}

/* ------------------------------------------------------------------ */
/* Dados por tipo (espelho fiel do d.ts, um campo por linha do schema) */
/* ------------------------------------------------------------------ */

/** `read_aloud` */
export interface ReadAloudData {
  text: string;
}
/** `repeat_sentence` */
export interface RepeatSentenceData {
  transcript: string;
}
/** `describe_image` — `image` = `/di/<arquivo>.png` → `images/describe_image/` */
export interface DescribeImageData {
  image: string;
  alt: string;
  facts: string[];
  keywords: string[];
}
/** `retell_lecture` */
export interface RetellLectureData {
  transcript: string;
  keywords: string[];
  sample: string;
}
/** `answer_short` — `answers` = respostas aceitas */
export interface AnswerShortData {
  question: string;
  answers: string[];
}
/** `sgd` */
export interface SgdTurn {
  speaker: string;
  text: string;
}
export interface SgdData {
  turns: SgdTurn[];
  keywords: string[];
}
/** `rts` */
export interface RtsData {
  scenario: string;
}
/** `swt` */
export interface SwtData {
  text: string;
  keywords: string[];
  sample: string;
}
/** `write_essay` (`sample` em ~54% dos itens) */
export interface WriteEssayData {
  prompt: string;
  sample?: string;
}
/** `read_fib_dropdown` — lacunas `{{1}}`, `{{2}}`… no `passage` */
export interface ReadFibDropdownBlank {
  options: string[];
  /** índice da opção correta */
  answer: number;
}
export interface ReadFibDropdownData {
  passage: string;
  blanks: ReadFibDropdownBlank[];
}
/** `read_fib_drag` — `answers[i]` = índice em `bank` */
export interface ReadFibDragData {
  passage: string;
  bank: string[];
  answers: number[];
}
/** `read_mcq_single` */
export interface ReadMcqSingleData {
  passage: string;
  question: string;
  options: string[];
  answer: number;
}
/** `read_mcq_multi` */
export interface ReadMcqMultiData {
  passage: string;
  question: string;
  options: string[];
  answer: number[];
}
/** `reorder_paragraphs` — `paragraphs` já na ordem CORRETA (embaralhar em runtime) */
export interface ReorderParagraphsData {
  paragraphs: string[];
}
/** `lst_mcq_single` */
export interface LstMcqSingleData {
  transcript: string;
  question: string;
  options: string[];
  answer: number;
}
/** `lst_mcq_multi` */
export interface LstMcqMultiData {
  transcript: string;
  question: string;
  options: string[];
  answer: number[];
}
/** `lst_fib` — `template` com `{{n}}`; `answers` preenche na ordem */
export interface LstFibData {
  template: string;
  answers: string[];
}
/** `lst_hcs` — `transcript` termina onde o áudio para */
export interface LstHcsData {
  transcript: string;
  options: string[];
  answer: number;
}
/** `lst_smw` — `transcript` termina onde o áudio para (com bip) */
export interface LstSmwData {
  transcript: string;
  options: string[];
  answer: number;
}
/** `lst_hiw` — palavras erradas = diferença entre `spoken` e `shown` */
export interface LstHiwData {
  spoken: string;
  shown: string;
}
/** `wfd` */
export interface WfdData {
  sentence: string;
}
/** `sst` */
export interface SstData {
  transcript: string;
  keywords: string[];
  sample: string;
}

/** União de todos os `data` do banco (mesma ordem/forma do d.ts). */
export type QuestionData =
  | ReadAloudData
  | RepeatSentenceData
  | DescribeImageData
  | RetellLectureData
  | AnswerShortData
  | SgdData
  | RtsData
  | SwtData
  | WriteEssayData
  | ReadFibDropdownData
  | ReadFibDragData
  | ReadMcqSingleData
  | ReadMcqMultiData
  | ReorderParagraphsData
  | LstMcqSingleData
  | LstMcqMultiData
  | LstFibData
  | LstHcsData
  | LstSmwData
  | LstHiwData
  | WfdData
  | SstData;

/** Forma armazenada (sem derivados). */
export type RawQuestion = RawQuestionBase & { data: QuestionData };

/* ------------------------------------------------------------------ */
/* União discriminada por `type` (uma variante por tipo)               */
/* ------------------------------------------------------------------ */

export interface ReadAloudQuestion extends QuestionBase {
  type: "read_aloud";
  data: ReadAloudData;
}
export interface RepeatSentenceQuestion extends QuestionBase {
  type: "repeat_sentence";
  data: RepeatSentenceData;
}
export interface DescribeImageQuestion extends QuestionBase {
  type: "describe_image";
  data: DescribeImageData;
}
export interface RetellLectureQuestion extends QuestionBase {
  type: "retell_lecture";
  data: RetellLectureData;
}
export interface AnswerShortQuestion extends QuestionBase {
  type: "answer_short";
  data: AnswerShortData;
}
export interface SgdQuestion extends QuestionBase {
  type: "sgd";
  data: SgdData;
}
export interface RtsQuestion extends QuestionBase {
  type: "rts";
  data: RtsData;
}
export interface SwtQuestion extends QuestionBase {
  type: "swt";
  data: SwtData;
}
export interface WriteEssayQuestion extends QuestionBase {
  type: "write_essay";
  data: WriteEssayData;
}
export interface ReadFibDropdownQuestion extends QuestionBase {
  type: "read_fib_dropdown";
  data: ReadFibDropdownData;
}
export interface ReadMcqMultiQuestion extends QuestionBase {
  type: "read_mcq_multi";
  data: ReadMcqMultiData;
}
export interface ReorderParagraphsQuestion extends QuestionBase {
  type: "reorder_paragraphs";
  data: ReorderParagraphsData;
}
export interface ReadFibDragQuestion extends QuestionBase {
  type: "read_fib_drag";
  data: ReadFibDragData;
}
export interface ReadMcqSingleQuestion extends QuestionBase {
  type: "read_mcq_single";
  data: ReadMcqSingleData;
}
export interface SstQuestion extends QuestionBase {
  type: "sst";
  data: SstData;
}
export interface LstMcqMultiQuestion extends QuestionBase {
  type: "lst_mcq_multi";
  data: LstMcqMultiData;
}
export interface LstFibQuestion extends QuestionBase {
  type: "lst_fib";
  data: LstFibData;
}
export interface LstHcsQuestion extends QuestionBase {
  type: "lst_hcs";
  data: LstHcsData;
}
export interface LstMcqSingleQuestion extends QuestionBase {
  type: "lst_mcq_single";
  data: LstMcqSingleData;
}
export interface LstSmwQuestion extends QuestionBase {
  type: "lst_smw";
  data: LstSmwData;
}
export interface LstHiwQuestion extends QuestionBase {
  type: "lst_hiw";
  data: LstHiwData;
}
export interface WfdQuestion extends QuestionBase {
  type: "wfd";
  data: WfdData;
}

/** Os 22 tipos como união discriminada por `type`. */
export type Question =
  | ReadAloudQuestion
  | RepeatSentenceQuestion
  | DescribeImageQuestion
  | RetellLectureQuestion
  | AnswerShortQuestion
  | SgdQuestion
  | RtsQuestion
  | SwtQuestion
  | WriteEssayQuestion
  | ReadFibDropdownQuestion
  | ReadMcqMultiQuestion
  | ReorderParagraphsQuestion
  | ReadFibDragQuestion
  | ReadMcqSingleQuestion
  | SstQuestion
  | LstMcqMultiQuestion
  | LstFibQuestion
  | LstHcsQuestion
  | LstMcqSingleQuestion
  | LstSmwQuestion
  | LstHiwQuestion
  | WfdQuestion;

/** Variante de questão de um tipo específico. */
export type QuestionOfType<T extends TaskType> = Extract<Question, { type: T }>;

/** Refinamento de tipo seguro para uso nos motores. */
export function isQuestionOfType<T extends TaskType>(
  question: Question,
  type: T,
): question is QuestionOfType<T> {
  return question.type === type;
}

/**
 * `canonicalId` efetivo: o do item quando o pacote trouxer um, senão o próprio `id`.
 * Centralizado para que nenhuma métrica use `id` diretamente por engano.
 */
export function canonicalIdOf(question: { id: string; canonicalId?: string | undefined }): string {
  return question.canonicalId ?? question.id;
}

/**
 * Tipos puramente orais (a resposta é áudio). Usado pelo harness (Fase 5) para
 * decidir quando pronúncia/fluência podem ser medidas — nunca para pontuar.
 */
export const ORAL_RESPONSE_TYPES = [
  "read_aloud",
  "repeat_sentence",
  "describe_image",
  "retell_lecture",
  "answer_short",
  "sgd",
  "rts",
] as const satisfies readonly TaskType[];

export type OralTaskType = (typeof ORAL_RESPONSE_TYPES)[number];

export function isOralTaskType(type: TaskType): type is OralTaskType {
  return (ORAL_RESPONSE_TYPES as readonly string[]).includes(type);
}
