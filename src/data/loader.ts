/**
 * Loader do banco de questões — a única porta de entrada do conteúdo no app.
 *
 * Contrato (Fase 2 → Fase 4+):
 * - `loadQuestionsByType(type)`  importa **um chunk por tipo** (lazy, de verdade) e
 *   devolve as questões já validadas por `parseQuestions` de `@/domain`.
 * - `loadManifest()`             devolve os agregados derivados por
 *   `scripts/bank/build-manifest.mjs` (fonte única de contagens/SEO).
 * - `bankImageUrl(file)`         resolve o caminho público de uma imagem do
 *   Describe Image (`public/di/<arquivo>` → `/di/<arquivo>`).
 *
 * Extras usados pelas fases seguintes (registados no relatório da Fase 2):
 * - `loadBankIndex()`   índice leve por item (catálogo/proveniência — Fases 4/11), lazy.
 * - `loadAliases()`     `{ id descartado: id canônico }` (vazio hoje; mantido para o futuro).
 * - `BANK_QUESTION_CHUNKS` mapa tipo → importador lazy (pré-cache da Fase 12).
 *
 * O conteúdo do banco é **dado não confiável** de origem externa: nada aqui confia
 * na forma do JSON — todo item passa pelo contrato de domínio antes de sair daqui.
 *
 * Módulo isomórfico (cliente/servidor): sem `node:*`, sem `fs`, sem rede.
 */

import {
  SECTION_BY_TYPE,
  TASK_TYPES,
  isTaskType,
  parseQuestions,
  type Provenance,
  type Question,
  type Section,
  type TaskType,
} from "@/domain";

/* ------------------------------------------------------------------ */
/* Tipos do manifesto derivado                                        */
/* ------------------------------------------------------------------ */

export interface BankTypeManifest {
  /** Número de itens do tipo (derivado, nunca digitado). */
  count: number;
  section: Section;
  /** Total de palavras do campo principal do tipo (catálogo). */
  words: number;
  byProvenance: Record<Provenance, number>;
}

export interface BankManifest {
  format: "pte-master-hub-bank-manifest";
  version: 1;
  generatedBy: string;
  source: {
    package: string;
    packageVersion: number | null;
    generatedAt: string | null;
  };
  totals: {
    questions: number;
    types: number;
    images: number;
    sources: number;
    sourceDomains: number;
    words: number;
  };
  byType: Record<TaskType, BankTypeManifest>;
  bySection: Record<Section, number>;
  byProvenance: Record<Provenance, number>;
  /** Contagem por `source.id` (chave do `MANIFEST.json` do pacote). */
  bySourceId: Record<string, number>;
  /** Contagem por domínio de fonte (independência de operador — Fase 11). */
  byDomain: Record<string, number>;
  /** Caminhos públicos das imagens do Describe Image. */
  images: string[];
}

/** Entrada do índice por item — payload enxuto, sem texto de questão. */
export interface BankIndexItem {
  id: string;
  /** `canonicalId` efetivo (`aliases.json` vazio ⇒ igual a `id`). */
  canonicalId: string;
  type: TaskType;
  section: Section;
  domain: string;
  provenance: Provenance;
  topic?: string;
  words: number;
}

export interface BankIndex {
  format: "pte-master-hub-bank-index";
  version: 1;
  generatedBy: string;
  items: BankIndexItem[];
}

type QuestionChunk = { default: unknown };
type Loader = () => Promise<QuestionChunk>;

/* ------------------------------------------------------------------ */
/* Chunks por tipo (lazy)                                             */
/* ------------------------------------------------------------------ */

/**
 * `eager: false` (padrão) é o ponto central: cada tipo vira um chunk separado e
 * só é baixado quando o aluno abre aquele tipo. Os valores são funções de import
 * dinâmico — é isso que os testes usam para provar que não há carga antecipada.
 */
const questionModules = import.meta.glob<QuestionChunk>("./bank/questions/*.json");

function buildChunkMap(): Partial<Record<TaskType, Loader>> {
  const map: Partial<Record<TaskType, Loader>> = {};
  for (const [path, loader] of Object.entries(questionModules)) {
    const match = /^\.\/bank\/questions\/([a-z_]+)\.json$/.exec(path);
    const id = match?.[1];
    if (id !== undefined && isTaskType(id)) {
      map[id] = loader;
    }
  }
  return map;
}

/**
 * Mapa tipo → importador lazy, congelado. Incompleto somente se um arquivo do
 * banco sumir do repositório — `loadQuestionsByType` falha alto nesse caso.
 */
export const BANK_QUESTION_CHUNKS: Readonly<Partial<Record<TaskType, Loader>>> =
  Object.freeze(buildChunkMap());

/* ------------------------------------------------------------------ */
/* Cache de módulo                                                    */
/* ------------------------------------------------------------------ */

let manifestPromise: Promise<BankManifest> | undefined;
let indexPromise: Promise<BankIndex> | undefined;
let aliasesPromise: Promise<Record<string, string>> | undefined;
const questionsCache = new Map<TaskType, Promise<Question[]>>();

/** Limpa todos os caches (testes e recarregamento explícito). */
export function resetBankCache(): void {
  manifestPromise = undefined;
  indexPromise = undefined;
  aliasesPromise = undefined;
  questionsCache.clear();
}

/* ------------------------------------------------------------------ */
/* Validação estrutural do manifesto                                  */
/* ------------------------------------------------------------------ */

function invalid(path: string, detail: string): never {
  throw new Error(`Banco inválido em ${path}: ${detail}`);
}

function expectCount(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    invalid(path, `esperado inteiro >= 0, recebeu ${JSON.stringify(value)}`);
  }
  return value;
}

function expectCountRecord<T extends string>(
  raw: unknown,
  keys: readonly T[],
  path: string,
): Record<T, number> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    invalid(path, "esperado objeto");
  }
  const record = raw as Record<string, unknown>;
  const result = {} as Record<T, number>;
  for (const key of keys) {
    result[key] = expectCount(record[key], `${path}.${key}`);
  }
  for (const key of Object.keys(record)) {
    if (!(keys as readonly string[]).includes(key)) invalid(`${path}.${key}`, "chave desconhecida");
  }
  return result;
}

const PROVENANCE_KEYS: readonly Provenance[] = ["verificada", "corroborada", "comunitaria"];
const SECTION_KEYS: readonly Section[] = ["speaking", "writing", "reading", "listening"];

/** Valida o manifesto derivado. Falha alto em vez de servir número errado. */
export function parseBankManifest(raw: unknown): BankManifest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    invalid("manifest", "esperado objeto");
  }
  const record = raw as Record<string, unknown>;
  if (record["format"] !== "pte-master-hub-bank-manifest") {
    invalid("manifest.format", `formato inesperado: ${JSON.stringify(record["format"])}`);
  }
  if (record["version"] !== 1) {
    invalid("manifest.version", `versão não suportada: ${JSON.stringify(record["version"])}`);
  }

  const totalsRaw = record["totals"];
  if (typeof totalsRaw !== "object" || totalsRaw === null) invalid("manifest.totals", "ausente");
  const totalsRecord = totalsRaw as Record<string, unknown>;

  const byTypeRaw = record["byType"];
  if (typeof byTypeRaw !== "object" || byTypeRaw === null || Array.isArray(byTypeRaw)) {
    invalid("manifest.byType", "esperado objeto");
  }
  const byTypeRecord = byTypeRaw as Record<string, unknown>;
  const byType = {} as Record<TaskType, BankTypeManifest>;
  for (const type of TASK_TYPES) {
    const entryRaw = byTypeRecord[type];
    if (typeof entryRaw !== "object" || entryRaw === null || Array.isArray(entryRaw)) {
      invalid(`manifest.byType.${type}`, "ausente");
    }
    const entry = entryRaw as Record<string, unknown>;
    if (entry["section"] !== SECTION_BY_TYPE[type]) {
      invalid(
        `manifest.byType.${type}.section`,
        `esperado ${SECTION_BY_TYPE[type]}, recebeu ${JSON.stringify(entry["section"])}`,
      );
    }
    byType[type] = {
      count: expectCount(entry["count"], `manifest.byType.${type}.count`),
      section: SECTION_BY_TYPE[type],
      words: expectCount(entry["words"], `manifest.byType.${type}.words`),
      byProvenance: expectCountRecord(
        entry["byProvenance"],
        PROVENANCE_KEYS,
        `manifest.byType.${type}.byProvenance`,
      ),
    };
  }

  const bySection = expectCountRecord(record["bySection"], SECTION_KEYS, "manifest.bySection");
  const byProvenance = expectCountRecord(
    record["byProvenance"],
    PROVENANCE_KEYS,
    "manifest.byProvenance",
  );

  const bySourceIdRaw = record["bySourceId"];
  if (typeof bySourceIdRaw !== "object" || bySourceIdRaw === null || Array.isArray(bySourceIdRaw)) {
    invalid("manifest.bySourceId", "esperado objeto");
  }
  const bySourceId: Record<string, number> = {};
  for (const [key, value] of Object.entries(bySourceIdRaw as Record<string, unknown>)) {
    bySourceId[key] = expectCount(value, `manifest.bySourceId.${key}`);
  }

  const byDomainRaw = record["byDomain"];
  if (typeof byDomainRaw !== "object" || byDomainRaw === null || Array.isArray(byDomainRaw)) {
    invalid("manifest.byDomain", "esperado objeto");
  }
  const byDomain: Record<string, number> = {};
  for (const [key, value] of Object.entries(byDomainRaw as Record<string, unknown>)) {
    byDomain[key] = expectCount(value, `manifest.byDomain.${key}`);
  }

  const imagesRaw = record["images"];
  if (!Array.isArray(imagesRaw) || imagesRaw.some((image) => typeof image !== "string")) {
    invalid("manifest.images", "esperado array de strings");
  }

  const sourceRaw = record["source"];
  if (typeof sourceRaw !== "object" || sourceRaw === null) invalid("manifest.source", "ausente");
  const sourceRecord = sourceRaw as Record<string, unknown>;
  if (typeof sourceRecord["package"] !== "string") {
    invalid("manifest.source.package", "esperado string");
  }

  const manifest: BankManifest = {
    format: "pte-master-hub-bank-manifest",
    version: 1,
    generatedBy: String(record["generatedBy"] ?? ""),
    source: {
      package: sourceRecord["package"],
      packageVersion:
        typeof sourceRecord["packageVersion"] === "number" ? sourceRecord["packageVersion"] : null,
      generatedAt:
        typeof sourceRecord["generatedAt"] === "string" ? sourceRecord["generatedAt"] : null,
    },
    totals: {
      questions: expectCount(totalsRecord["questions"], "manifest.totals.questions"),
      types: expectCount(totalsRecord["types"], "manifest.totals.types"),
      images: expectCount(totalsRecord["images"], "manifest.totals.images"),
      sources: expectCount(totalsRecord["sources"], "manifest.totals.sources"),
      sourceDomains: expectCount(totalsRecord["sourceDomains"], "manifest.totals.sourceDomains"),
      words: expectCount(totalsRecord["words"], "manifest.totals.words"),
    },
    byType,
    bySection,
    byProvenance,
    bySourceId,
    byDomain,
    images: imagesRaw as string[],
  };

  // Coerências que impedem número envelhecido de passar batido.
  const sumByType = TASK_TYPES.reduce((sum, type) => sum + byType[type].count, 0);
  if (sumByType !== manifest.totals.questions) {
    invalid("manifest.totals.questions", `soma por tipo (${sumByType}) ≠ total`);
  }
  const sumBySection = SECTION_KEYS.reduce((sum, section) => sum + bySection[section], 0);
  if (sumBySection !== manifest.totals.questions) {
    invalid("manifest.bySection", `soma por seção (${sumBySection}) ≠ total`);
  }
  const sumByProvenance = PROVENANCE_KEYS.reduce(
    (sum, provenance) => sum + byProvenance[provenance],
    0,
  );
  if (sumByProvenance !== manifest.totals.questions) {
    invalid("manifest.byProvenance", `soma por proveniência (${sumByProvenance}) ≠ total`);
  }
  if (manifest.totals.types !== TASK_TYPES.length) {
    invalid("manifest.totals.types", `esperado ${TASK_TYPES.length} tipos com banco`);
  }

  return manifest;
}

function parseBankIndex(raw: unknown, manifest: BankManifest): BankIndex {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    invalid("index", "esperado objeto");
  }
  const record = raw as Record<string, unknown>;
  if (record["format"] !== "pte-master-hub-bank-index") {
    invalid("index.format", `formato inesperado: ${JSON.stringify(record["format"])}`);
  }
  if (record["version"] !== 1) {
    invalid("index.version", `versão não suportada: ${JSON.stringify(record["version"])}`);
  }
  const itemsRaw = record["items"];
  if (!Array.isArray(itemsRaw)) invalid("index.items", "esperado array");

  const items: BankIndexItem[] = itemsRaw.map((itemRaw, index) => {
    if (typeof itemRaw !== "object" || itemRaw === null || Array.isArray(itemRaw)) {
      invalid(`index.items[${index}]`, "esperado objeto");
    }
    const item = itemRaw as Record<string, unknown>;
    const id = item["id"];
    const type = item["type"];
    if (typeof id !== "string" || id.length === 0) invalid(`index.items[${index}].id`, "inválido");
    if (!isTaskType(type))
      invalid(`index.items[${index}].type`, `tipo desconhecido: ${String(type)}`);
    const provenance = item["provenance"];
    if (!(PROVENANCE_KEYS as readonly unknown[]).includes(provenance)) {
      invalid(`index.items[${index}].provenance`, `proveniência inválida: ${String(provenance)}`);
    }
    if (item["section"] !== SECTION_BY_TYPE[type]) {
      invalid(`index.items[${index}].section`, `seção não confere com o tipo ${type}`);
    }
    if (typeof item["domain"] !== "string" || item["domain"].length === 0) {
      invalid(`index.items[${index}].domain`, "inválido");
    }
    const parsed: BankIndexItem = {
      id,
      canonicalId: typeof item["canonicalId"] === "string" ? item["canonicalId"] : id,
      type,
      section: SECTION_BY_TYPE[type],
      domain: item["domain"],
      provenance: provenance as Provenance,
      words: expectCount(item["words"], `index.items[${index}].words`),
    };
    const topic = item["topic"];
    if (typeof topic === "string" && topic.length > 0) parsed.topic = topic;
    return parsed;
  });

  if (items.length !== manifest.totals.questions) {
    invalid("index.items", `${items.length} itens ≠ ${manifest.totals.questions} do manifesto`);
  }
  return {
    format: "pte-master-hub-bank-index",
    version: 1,
    generatedBy: String(record["generatedBy"] ?? ""),
    items,
  };
}

/* ------------------------------------------------------------------ */
/* API pública                                                        */
/* ------------------------------------------------------------------ */

function moduleDefault(module: unknown, path: string): unknown {
  if (typeof module !== "object" || module === null || !("default" in module)) {
    invalid(path, "módulo sem export default");
  }
  return (module as { default: unknown }).default;
}

/**
 * Carrega o manifesto derivado (contagens, seções, proveniência, imagens).
 * Lazy e cacheado: o chunk do manifesto não entra no bundle inicial.
 */
export function loadManifest(): Promise<BankManifest> {
  manifestPromise ??= import("./generated/manifest.json").then((module) =>
    parseBankManifest(moduleDefault(module, "generated/manifest.json")),
  );
  return manifestPromise;
}

/**
 * Carrega o índice leve por item. Lazy: só o catálogo/proveniência (Fases 4/11)
 * precisam dele; a Home e o badge de revisão usam apenas o manifesto.
 */
export function loadBankIndex(): Promise<BankIndex> {
  indexPromise ??= Promise.all([loadManifest(), import("./generated/index.json")]).then(
    ([manifest, module]) => parseBankIndex(moduleDefault(module, "generated/index.json"), manifest),
  );
  return indexPromise;
}

/** `{ id descartado: id canônico }` — vazio no pacote atual; mantido para o futuro. */
export function loadAliases(): Promise<Record<string, string>> {
  aliasesPromise ??= import("./bank/aliases.json").then((module) => {
    const raw = moduleDefault(module, "bank/aliases.json");
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      invalid("bank/aliases.json", "esperado objeto { id: idCanonico }");
    }
    const aliases: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value !== "string" || value.length === 0) {
        invalid(`bank/aliases.json.${key}`, "valor deve ser um id canônico");
      }
      aliases[key] = value;
    }
    return aliases;
  });
  return aliasesPromise;
}

/**
 * Carrega as questões de um tipo, já validadas pelo contrato de domínio.
 *
 * - Um chunk por tipo (`import.meta.glob` lazy) → abrir `rts` não baixa `wfd`.
 * - Cache por tipo: chamadas repetidas devolvem a mesma promise/array.
 * - Tipo fora dos 22 (ou com arquivo ausente) é erro explícito, nunca lista vazia.
 */
export function loadQuestionsByType(type: TaskType): Promise<Question[]> {
  if (!isTaskType(type)) {
    return Promise.reject(new Error(`Tipo de tarefa desconhecido: ${String(type)}`));
  }
  const cached = questionsCache.get(type);
  if (cached) return cached;

  const chunk = BANK_QUESTION_CHUNKS[type];
  const loading = Promise.resolve().then(async () => {
    if (!chunk) {
      throw new Error(`Chunk do banco ausente para o tipo ${type} (src/data/bank/questions)`);
    }
    const module = await chunk();
    const questions = parseQuestions(
      moduleDefault(module, `bank/questions/${type}.json`),
      `bank[${type}]`,
    );
    const wrongType = questions.find((question) => question.type !== type);
    if (wrongType) {
      throw new Error(`banco[${type}]: item ${wrongType.id} declara tipo ${wrongType.type}`);
    }
    return questions;
  });

  questionsCache.set(type, loading);
  // Falha não deve envenenar o cache: a próxima chamada tenta de novo.
  loading.catch(() => {
    if (questionsCache.get(type) === loading) questionsCache.delete(type);
  });
  return loading;
}

/**
 * Resolve o caminho público de uma imagem do Describe Image.
 *
 * O banco já grava `/di/<arquivo>.png`; a função aceita também o nome do arquivo
 * ou `di/<arquivo>.png`, porque consumidores diferentes recebem o campo de formas
 * diferentes. Nunca inventa subpasta: a imagem está em `public/di/`.
 */
export function bankImageUrl(file: string): string {
  const cleaned = file
    .trim()
    .replace(/^\/?di\//, "")
    .replace(/^\/+/, "");
  if (cleaned.length === 0) {
    throw new Error("bankImageUrl: caminho de imagem vazio");
  }
  if (cleaned.includes("..") || cleaned.includes("/") || cleaned.includes("\\")) {
    throw new Error(`bankImageUrl: caminho de imagem inválido: ${file}`);
  }
  return `/di/${cleaned}`;
}
