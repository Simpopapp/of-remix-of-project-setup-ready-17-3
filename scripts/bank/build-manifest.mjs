#!/usr/bin/env node
/**
 * Gera o manifesto do banco a partir dos arquivos versionados no app e confere
 * contra o `MANIFEST.json` do pacote de origem.
 *
 * Regra central (project1 §8): nenhuma contagem exibida no produto é digitada —
 * todas derivam deste artefato. O script não "corrige" números: se a recontagem
 * divergir do `MANIFEST.json` do pacote, sai com código 1 e lista as diferenças.
 *
 * Uso (de qualquer diretório):
 *   node scripts/bank/build-manifest.mjs
 *
 * Entradas (somente leitura):
 *   src/data/bank/questions/<tipo>.json   (22 arquivos — conteúdo do pacote)
 *   src/data/bank/MANIFEST.json           (referência de conferência do pacote)
 *   src/data/bank/aliases.json            ({ id descartado: id canônico })
 *   public/di/*.png                       (imagens do Describe Image)
 *
 * Saídas (geradas; nunca editar à mão):
 *   src/data/generated/manifest.json      agregados que a aplicação consome
 *   src/data/generated/index.json         índice por item (lazy, Fase 4/11)
 *
 * Node 18+, sem dependências.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BANK_DIR = join(ROOT, "src", "data", "bank");
const QUESTIONS_DIR = join(BANK_DIR, "questions");
const GENERATED_DIR = join(ROOT, "src", "data", "generated");
const IMAGES_DIR = join(ROOT, "public", "di");

/**
 * Seção de cada tipo — espelho de `SECTION_BY_TYPE` em `src/domain/question.ts`.
 * O teste `src/test/bank/integrity.test.ts` compara este mapa com o do domínio;
 * qualquer divergência falha o gate, então não há duas verdades em produção.
 */
export const SECTION_BY_TYPE = {
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

export const SECTION_ORDER = ["speaking", "writing", "reading", "listening"];
export const PROVENANCE_ORDER = ["verificada", "corroborada", "comunitaria"];

/** Campo cujo tamanho em palavras é medido para o catálogo (payload enxuto). */
const WORD_FIELD = {
  read_aloud: (d) => d.text,
  repeat_sentence: (d) => d.transcript,
  describe_image: (d) => d.alt,
  retell_lecture: (d) => d.transcript,
  answer_short: (d) => d.question,
  sgd: (d) => d.turns.map((turn) => turn.text).join(" "),
  rts: (d) => d.scenario,
  swt: (d) => d.text,
  write_essay: (d) => d.prompt,
  read_fib_dropdown: (d) => d.passage,
  read_mcq_multi: (d) => `${d.passage} ${d.question}`,
  reorder_paragraphs: (d) => d.paragraphs.join(" "),
  read_fib_drag: (d) => d.passage,
  read_mcq_single: (d) => `${d.passage} ${d.question}`,
  sst: (d) => d.transcript,
  lst_mcq_multi: (d) => d.transcript,
  lst_fib: (d) => d.template,
  lst_hcs: (d) => d.transcript,
  lst_mcq_single: (d) => d.transcript,
  lst_smw: (d) => d.transcript,
  lst_hiw: (d) => d.spoken,
  wfd: (d) => d.sentence,
};

const countWords = (value) => String(value ?? "").trim().split(/\s+/).filter(Boolean).length;

/** Ordena chaves de objeto para que a saída seja byte-a-byte estável. */
function sortRecord(record) {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

function emptyProvenanceCounter() {
  return Object.fromEntries(PROVENANCE_ORDER.map((provenance) => [provenance, 0]));
}

/**
 * Reconta tudo a partir dos arquivos do app. Puro (nenhuma escrita): devolve o
 * manifesto, o índice e a lista de erros encontrados.
 */
export function buildDerived() {
  const errors = [];
  const manifestPath = join(BANK_DIR, "MANIFEST.json");
  const aliasesPath = join(BANK_DIR, "aliases.json");

  if (!existsSync(manifestPath)) errors.push(`MANIFEST.json ausente em ${BANK_DIR}`);
  if (!existsSync(aliasesPath)) errors.push(`aliases.json ausente em ${BANK_DIR}`);
  if (!existsSync(QUESTIONS_DIR)) errors.push(`pasta de questões ausente: ${QUESTIONS_DIR}`);

  const referential = errors.length === 0 ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  const aliases = errors.length === 0 ? JSON.parse(readFileSync(aliasesPath, "utf8")) : {};

  const files = existsSync(QUESTIONS_DIR)
    ? readdirSync(QUESTIONS_DIR)
        .filter((file) => file.endsWith(".json"))
        .sort()
    : [];
  const fileTypes = files.map((file) => file.replace(/\.json$/, ""));

  for (const type of Object.keys(SECTION_BY_TYPE)) {
    if (!fileTypes.includes(type)) errors.push(`arquivo de questões ausente para o tipo ${type}`);
  }
  for (const type of fileTypes) {
    if (!Object.hasOwn(SECTION_BY_TYPE, type)) errors.push(`arquivo de tipo desconhecido: ${type}.json`);
  }

  const byType = {};
  const bySection = Object.fromEntries(SECTION_ORDER.map((section) => [section, 0]));
  const byProvenance = emptyProvenanceCounter();
  /** Contagem por `source.id` — é a chave que o MANIFEST do pacote usa. */
  const bySourceId = {};
  /** Contagem por domínio — independência de operador (Fase 11). */
  const byDomain = {};
  const items = [];
  const ids = new Set();
  const imagePaths = new Set();
  let totalWords = 0;

  for (const file of files) {
    const type = file.replace(/\.json$/, "");
    const questions = JSON.parse(readFileSync(join(QUESTIONS_DIR, file), "utf8"));
    if (!Array.isArray(questions)) {
      errors.push(`${file}: conteúdo não é um array`);
      continue;
    }

    const section = SECTION_BY_TYPE[type];
    const typeProvenance = emptyProvenanceCounter();
    let typeWords = 0;

    for (const question of questions) {
      if (question.type !== type) {
        errors.push(`${question.id}: type "${question.type}" no arquivo de ${type}`);
      }
      if (ids.has(question.id)) errors.push(`id duplicado no banco: ${question.id}`);
      ids.add(question.id);

      const provenance = question.provenance;
      if (!PROVENANCE_ORDER.includes(provenance)) {
        errors.push(`${question.id}: proveniência inválida "${provenance}"`);
      } else {
        byProvenance[provenance] += 1;
        typeProvenance[provenance] += 1;
      }

      const domain = question.source?.domain ?? "";
      if (!domain) errors.push(`${question.id}: source.domain ausente`);
      const sourceId = question.source?.id ?? "";
      if (!sourceId) errors.push(`${question.id}: source.id ausente`);
      bySourceId[sourceId] = (bySourceId[sourceId] ?? 0) + 1;
      byDomain[domain] = (byDomain[domain] ?? 0) + 1;

      const words = countWords(WORD_FIELD[type]?.(question.data));
      typeWords += words;

      const item = {
        id: question.id,
        type,
        section,
        domain,
        provenance,
        words,
      };
      if (question.topic) item.topic = question.topic;
      items.push(item);

      if (type === "describe_image") {
        const image = String(question.data?.image ?? "");
        if (!image.startsWith("/di/")) {
          errors.push(`${question.id}: data.image fora de /di/ ("${image}")`);
        } else {
          imagePaths.add(image);
          const fileName = image.slice("/di/".length);
          if (!existsSync(join(IMAGES_DIR, fileName))) {
            errors.push(`${question.id}: imagem ausente em public/di/${fileName}`);
          }
        }
      }
    }

    if (byType[type]) errors.push(`tipo duplicado na contagem: ${type}`);
    byType[type] = {
      count: questions.length,
      section,
      words: typeWords,
      byProvenance: typeProvenance,
    };
    bySection[section] += questions.length;
    totalWords += typeWords;
  }

  const diskImages = existsSync(IMAGES_DIR)
    ? readdirSync(IMAGES_DIR)
        .filter((file) => file.endsWith(".png"))
        .sort()
    : [];
  for (const image of imagePaths) {
    const fileName = image.slice("/di/".length);
    if (!diskImages.includes(fileName)) errors.push(`imagem referenciada ausente: ${image}`);
  }
  for (const fileName of diskImages) {
    if (!imagePaths.has(`/di/${fileName}`)) errors.push(`imagem órfã em public/di: ${fileName}`);
  }

  const totalQuestions = items.length;
  const manifest = {
    format: "pte-master-hub-bank-manifest",
    version: 1,
    generatedBy: "scripts/bank/build-manifest.mjs",
    source: {
      package: referential?.pacote ?? "pte-question-bank",
      packageVersion: referential?.versao ?? null,
      generatedAt: referential?.geradoEm ?? null,
    },
    totals: {
      questions: totalQuestions,
      types: Object.keys(byType).length,
      images: diskImages.length,
      sources: Object.keys(bySourceId).length,
      sourceDomains: Object.keys(byDomain).length,
      words: totalWords,
    },
    byType: sortRecord(byType),
    bySection,
    byProvenance,
    bySourceId: sortRecord(bySourceId),
    byDomain: sortRecord(byDomain),
    images: diskImages.map((fileName) => `/di/${fileName}`),
  };

  const index = {
    format: "pte-master-hub-bank-index",
    version: 1,
    generatedBy: "scripts/bank/build-manifest.mjs",
    items,
  };

  if (Object.keys(aliases).length !== 0) {
    errors.push(`aliases.json deveria estar vazio neste pacote; encontrado ${Object.keys(aliases).length} alias(es)`);
  }

  const diffs = referential ? compareWithReference(manifest, referential) : [];
  return { manifest, index, errors, diffs };
}

/** Compara o derivado com o `MANIFEST.json` do pacote, campo a campo. */
export function compareWithReference(manifest, reference) {
  const diffs = [];
  const check = (label, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) diffs.push(`${label}: derivado ${a} ≠ pacote ${e}`);
  };

  check("totalQuestoes", manifest.totals.questions, reference.totalQuestoes);
  check("tiposComBanco", manifest.totals.types, reference.tiposComBanco);
  check("imagens", manifest.totals.images, reference.imagens);
  check(
    "contagemPorTipo",
    sortRecord(
      Object.fromEntries(Object.entries(manifest.byType).map(([type, data]) => [type, data.count])),
    ),
    sortRecord(reference.contagemPorTipo ?? {}),
  );
  check(
    "contagemPorSecao",
    sortRecord(manifest.bySection),
    sortRecord(reference.contagemPorSecao ?? {}),
  );
  check(
    "proveniencia",
    sortRecord(manifest.byProvenance),
    sortRecord(reference.proveniencia ?? {}),
  );
  check(
    "itensPorFonte",
    sortRecord(manifest.bySourceId),
    sortRecord(reference.itensPorFonte ?? {}),
  );
  return diffs;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function formatDiffList(label, list) {
  if (list.length === 0) return "";
  return [`${label} (${list.length}):`, ...list.map((line) => `  ✗ ${line}`)].join("\n");
}

function main() {
  const { manifest, index, errors, diffs } = buildDerived();

  mkdirSync(GENERATED_DIR, { recursive: true });
  const manifestOut = join(GENERATED_DIR, "manifest.json");
  const indexOut = join(GENERATED_DIR, "index.json");
  writeFileSync(manifestOut, `${JSON.stringify(manifest, null, 1)}\n`, "utf8");
  writeFileSync(indexOut, `${JSON.stringify(index)}\n`, "utf8");

  const lines = [
    `Banco: ${manifest.totals.questions} questões · ${manifest.totals.types} tipos · ${manifest.totals.images} imagens · ${manifest.totals.sources} fontes (${manifest.totals.sourceDomains} domínios)`,
    `Por seção: ${SECTION_ORDER.map((section) => `${section} ${manifest.bySection[section]}`).join(" · ")}`,
    `Proveniência: ${PROVENANCE_ORDER.map((p) => `${p} ${manifest.byProvenance[p]}`).join(" · ")}`,
    `Gerado: ${manifestOut} (${sha256File(manifestOut).slice(0, 12)}…)`,
    `Gerado: ${indexOut} (${sha256File(indexOut).slice(0, 12)}…)`,
  ];

  const errorBlock = formatDiffList("ERROS", errors);
  const diffBlock = formatDiffList("DIVERGÊNCIAS vs MANIFEST.json", diffs);
  if (errorBlock) lines.push(errorBlock);
  if (diffBlock) lines.push(diffBlock);

  if (errors.length === 0 && diffs.length === 0) {
    lines.push("OK — manifesto derivado idêntico ao MANIFEST.json do pacote.");
    console.log(lines.join("\n"));
    return;
  }
  console.error(lines.join("\n"));
  process.exit(1);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) main();
