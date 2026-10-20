/**
 * Catálogo unificado dos tipos de tarefa do PTE Academic (Fase 4 — s3-catalogo).
 *
 * Este módulo é a **única** derivação do catálogo: ele transforma o manifesto do banco
 * (`loadManifest()`) em uma lista de entradas prontas para a tela — e nada mais. Não
 * contém contagem digitada, não lê o banco real e não sabe nada de React: é dado puro,
 * derivado, testável isoladamente (o mesmo contrato será consumido pela Fase 11 para
 * selo de proveniência e números derivados).
 *
 * Regras que este arquivo garante:
 *
 * 1. **Nenhum número envelhecido.** Toda contagem vem de `manifest.byType[type].count`
 *    e todo total vem da soma das entradas. Se o banco mudar, a tela muda com ele.
 *    O teste de prevenção injeta um manifesto sintético e prova que a saída o reflete.
 * 2. **Cobertura honesta.** `status: "sparse"` não é erro nem "indisponível": significa
 *    que o banco tem menos itens daquele tipo do que o desejável para treino repetido.
 *    A lacuna é exibida como está — nunca preenchida com conteúdo inventado
 *    (project1 §9 / PRD central §14.5).
 * 3. **Ordem do exame.** A saída segue `EXAM_TASK_ORDER` (ordem oficial das tarefas
 *    pontuadas), agrupada por seção na ordem em que as seções aparecem no exame.
 * 4. **Um só vocabulário.** Os nomes pt-BR vivem neste arquivo (`TASK_DISPLAY_NAMES`)
 *    e o teste de contrato falha se divergirem do nome oficial de `exam-spec.ts`.
 */

import { EXAM_TASKS, EXAM_TASK_ORDER } from "@/data/exam-spec";
import type { BankManifest } from "@/data/loader";
import { SECTION_BY_TYPE, TASK_TYPES, isTaskType, type Section, type TaskType } from "@/domain";

/**
 * ADR (s3-catalogo): limiar de "cobertura limitada".
 *
 * Política de honestidade do produto, **não** um número do exame: abaixo de 60 itens
 * de um tipo, a variedade é pequena para treino repetido e o catálogo diz isso ao aluno.
 * O limiar é único, explícito e vive aqui para não virar número mágico espalhado na UI.
 */
export const SPARSE_COUNT_THRESHOLD = 60;

/**
 * Nome canônico exibido no catálogo: nome oficial em inglês + leitura em pt-BR.
 *
 * Mapa local (decisão do pacote): a UI fala a língua do aluno, mas o nome do exame
 * permanece intacto para ele reconhecer a tarefa na prova. O teste de contrato compara
 * cada string com `EXAM_TASKS` — se o `exam-spec` mudar, o teste aponta a divergência.
 */
export const TASK_DISPLAY_NAMES: Readonly<Record<TaskType, string>> = Object.freeze({
  read_aloud: "Read Aloud — Ler em voz alta",
  repeat_sentence: "Repeat Sentence — Repetir a frase",
  describe_image: "Describe Image — Descrever imagem",
  retell_lecture: "Retell Lecture — Recontar a palestra",
  answer_short: "Answer Short Question — Responder a pergunta curta",
  sgd: "Summarize Group Discussion — Resumir discussão em grupo",
  rts: "Respond to a Situation — Responder a uma situação",
  swt: "Summarize Written Text — Resumir texto escrito",
  write_essay: "Write Essay — Escrever redação",
  read_fib_dropdown:
    "Reading: Fill in the Blanks (Dropdown) — Leitura: preencher lacunas (menu suspenso)",
  read_mcq_multi:
    "Reading: Multiple Choice, Multiple Answers — Leitura: múltipla escolha, várias respostas",
  reorder_paragraphs: "Reading: Re-order Paragraphs — Leitura: reordenar parágrafos",
  read_fib_drag:
    "Reading: Fill in the Blanks (Drag and Drop) — Leitura: preencher lacunas (arrastar e soltar)",
  read_mcq_single:
    "Reading: Multiple Choice, Single Answer — Leitura: múltipla escolha, resposta única",
  sst: "Listening: Summarize Spoken Text — Escuta: resumir texto falado",
  lst_mcq_multi:
    "Listening: Multiple Choice, Multiple Answers — Escuta: múltipla escolha, várias respostas",
  lst_fib: "Listening: Fill in the Blanks (Type In) — Escuta: preencher lacunas (digitar)",
  lst_hcs: "Listening: Highlight Correct Summary — Escuta: destacar o resumo correto",
  lst_mcq_single:
    "Listening: Multiple Choice, Single Answer — Escuta: múltipla escolha, resposta única",
  lst_smw: "Listening: Select Missing Word — Escuta: selecionar a palavra ausente",
  lst_hiw: "Listening: Highlight Incorrect Words — Escuta: destacar palavras incorretas",
  wfd: "Listening: Write from Dictation — Escuta: escrever a partir do ditado",
});

/** Status de cobertura de um tipo no catálogo. */
export type CatalogStatus = "available" | "sparse";

/** Uma entrada do catálogo — tudo derivado, nada digitado. */
export interface CatalogEntry {
  type: TaskType;
  /** nome oficial + leitura em pt-BR (`TASK_DISPLAY_NAMES`) */
  name: string;
  section: Section;
  /** itens aprovados no banco para este tipo (do manifesto) */
  count: number;
  /** palavras do campo principal dos itens do tipo (do manifesto) */
  words: number;
  /** `sparse` = cobertura real abaixo do desejável, exibida e nunca ocultada */
  status: CatalogStatus;
  /** destino da prática: `/praticar/<type>` */
  href: string;
}

/** Grupo de entradas de uma seção do exame, na ordem em que o exame as apresenta. */
export interface CatalogSection {
  section: Section;
  /** rótulo curto em inglês (nome da seção no exame) */
  label: string;
  /** leitura em pt-BR da seção */
  labelPt: string;
  description: string;
  entries: CatalogEntry[];
  /** tipos nesta seção (derivado) */
  types: number;
  /** itens nesta seção (derivado) */
  questions: number;
  /** palavras nesta seção (derivado) */
  words: number;
  /** tipos com cobertura limitada nesta seção (derivado) */
  sparseTypes: number;
}

/** Resumo do catálogo inteiro, sempre derivado das entradas. */
export interface CatalogSummary {
  /** tipos cobertos pela derivação */
  types: number;
  /** tipos com pelo menos um item aprovado */
  typesWithContent: number;
  /** itens no banco (soma das entradas) */
  questions: number;
  /** palavras de referência (soma das entradas) */
  words: number;
  /** tipos com cobertura limitada */
  sparseTypes: number;
}

/** Rótulos das seções — texto de interface, sem relação com contagens. */
export const SECTION_LABELS: Readonly<
  Record<Section, { label: string; labelPt: string; description: string }>
> = Object.freeze({
  speaking: {
    label: "Speaking",
    labelPt: "Fala",
    description:
      "Tarefas faladas: você responde em voz alta, com preparação e tempo de resposta próprios de cada tipo.",
  },
  writing: {
    label: "Writing",
    labelPt: "Escrita",
    description:
      "Tarefas escritas com limite de palavras e de tempo, avaliadas por critérios por tipo.",
  },
  reading: {
    label: "Reading",
    labelPt: "Leitura",
    description:
      "Tarefas de leitura com texto, lacunas e opções — o tempo é o da seção, não por questão.",
  },
  listening: {
    label: "Listening",
    labelPt: "Escuta",
    description:
      "Tarefas de escuta a partir do áudio do item; algumas também pontuam escrita ou leitura.",
  },
});

/** Destino canônico da prática de um tipo. */
export function practiceHref(type: TaskType): string {
  return `/praticar/${type}`;
}

/**
 * `true` quando o tipo ainda não tem nenhum item aprovado no banco.
 *
 * O contrato de `status` tem dois valores (`available`/`sparse`); "sem conteúdo" é um
 * caso extremo de cobertura limitada e precisa ser tratado pela UI com o rótulo
 * "em breve" e o motivo — nunca com conteúdo duvidoso para preencher a tela.
 */
export function isComingSoon(entry: CatalogEntry): boolean {
  return entry.count === 0;
}

function invalid(detail: string): never {
  throw new Error(`Catálogo inválido: ${detail}`);
}

/**
 * Deriva o catálogo completo a partir do manifesto do banco.
 *
 * Lança (em vez de exibir número errado) se o manifesto não cobrir os tipos esperados
 * ou se a ordem oficial não corresponder exatamente aos tipos do contrato de domínio.
 */
export function deriveCatalog(manifest: BankManifest): CatalogEntry[] {
  if (EXAM_TASK_ORDER.length !== TASK_TYPES.length) {
    invalid(
      `EXAM_TASK_ORDER tem ${EXAM_TASK_ORDER.length} entradas para ${TASK_TYPES.length} tipos`,
    );
  }

  const seen = new Set<TaskType>();
  const entries = EXAM_TASK_ORDER.map((rawType) => {
    if (!isTaskType(rawType)) invalid(`tipo desconhecido em EXAM_TASK_ORDER: ${String(rawType)}`);
    if (seen.has(rawType)) invalid(`tipo repetido em EXAM_TASK_ORDER: ${rawType}`);
    seen.add(rawType);

    const type = rawType;
    const manifestEntry = manifest.byType[type];
    if (manifestEntry === undefined) invalid(`tipo ${type} ausente do manifesto do banco`);
    if (!Number.isInteger(manifestEntry.count) || manifestEntry.count < 0) {
      invalid(`contagem inválida para ${type}: ${String(manifestEntry.count)}`);
    }
    if (!Number.isInteger(manifestEntry.words) || manifestEntry.words < 0) {
      invalid(`palavras inválidas para ${type}: ${String(manifestEntry.words)}`);
    }
    if (manifestEntry.section !== SECTION_BY_TYPE[type]) {
      invalid(`seção do manifesto (${manifestEntry.section}) não confere com o tipo ${type}`);
    }

    const entry: CatalogEntry = {
      type,
      name: TASK_DISPLAY_NAMES[type],
      section: SECTION_BY_TYPE[type],
      count: manifestEntry.count,
      words: manifestEntry.words,
      status: manifestEntry.count < SPARSE_COUNT_THRESHOLD ? "sparse" : "available",
      href: practiceHref(type),
    };
    return entry;
  });

  if (seen.size !== TASK_TYPES.length) {
    const missing = TASK_TYPES.filter((type) => !seen.has(type));
    invalid(`tipos sem posição na ordem do exame: ${missing.join(", ")}`);
  }

  return entries;
}

/**
 * Agrupa por seção preservando a ordem de aparição (que é a ordem do exame).
 * Não usa lista de seções hardcoded: se `EXAM_TASK_ORDER` mudar, o agrupamento acompanha.
 */
export function groupCatalog(entries: readonly CatalogEntry[]): CatalogSection[] {
  const buckets = new Map<Section, CatalogEntry[]>();
  for (const entry of entries) {
    const bucket = buckets.get(entry.section);
    if (bucket === undefined) buckets.set(entry.section, [entry]);
    else bucket.push(entry);
  }

  return [...buckets.entries()].map(([section, sectionEntries]) => {
    const labels = SECTION_LABELS[section];
    return {
      section,
      label: labels.label,
      labelPt: labels.labelPt,
      description: labels.description,
      entries: sectionEntries,
      types: sectionEntries.length,
      questions: sectionEntries.reduce((sum, entry) => sum + entry.count, 0),
      words: sectionEntries.reduce((sum, entry) => sum + entry.words, 0),
      sparseTypes: sectionEntries.filter((entry) => entry.status === "sparse").length,
    };
  });
}

/** Resumo do catálogo — soma das entradas, nunca uma constante. */
export function summarizeCatalog(entries: readonly CatalogEntry[]): CatalogSummary {
  return {
    types: entries.length,
    typesWithContent: entries.filter((entry) => entry.count > 0).length,
    questions: entries.reduce((sum, entry) => sum + entry.count, 0),
    words: entries.reduce((sum, entry) => sum + entry.words, 0),
    sparseTypes: entries.filter((entry) => entry.status === "sparse").length,
  };
}

/** Nome oficial da tarefa em `exam-spec.ts` (usado no teste de contrato de nomes). */
export function officialTaskNames(): ReadonlyMap<string, { name: string; namePt: string }> {
  return new Map(EXAM_TASKS.map((task) => [task.id, { name: task.name, namePt: task.namePt }]));
}
