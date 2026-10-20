/**
 * Integridade do banco versionado (Fase 2).
 *
 * Prova, contra os arquivos reais do repositório:
 * 1. o pacote foi copiado sem perda (22 JSON de tipo + 2 JSON de topo + 20 PNG);
 * 2. `scripts/bank/build-manifest.mjs` reconta tudo e bate com o `MANIFEST.json`
 *    original (total, por tipo, por seção, proveniência, itens por fonte);
 * 3. todos os 2.823 itens passam no contrato de domínio (`parseQuestions`);
 * 4. ids são únicos no banco inteiro e as imagens do Describe Image existem.
 *
 * Sem `skipIf`: o banco agora vive no repositório — se faltar, o gate falha.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EXAM_TASKS } from "@/data/exam-spec";
import {
  SECTION_BY_TYPE,
  TASK_TYPES,
  parseQuestions,
  type DescribeImageQuestion,
  type Provenance,
  type Question,
  type TaskType,
} from "@/domain";

const ROOT = process.cwd();
const BANK_DIR = join(ROOT, "src", "data", "bank");
const QUESTIONS_DIR = join(BANK_DIR, "questions");
const GENERATED_DIR = join(ROOT, "src", "data", "generated");
const IMAGES_DIR = join(ROOT, "public", "di");
const SCRIPT = join(ROOT, "scripts", "bank", "build-manifest.mjs");

interface ReferenceManifest {
  totalQuestoes: number;
  tiposComBanco: number;
  contagemPorTipo: Record<string, number>;
  contagemPorSecao: Record<string, number>;
  proveniencia: Record<Provenance, number>;
  itensPorFonte: Record<string, number>;
  imagens: number;
}

interface DerivedManifest {
  format: string;
  version: number;
  totals: {
    questions: number;
    types: number;
    images: number;
    sources: number;
    sourceDomains: number;
    words: number;
  };
  byType: Record<TaskType, { count: number; section: string; words: number }>;
  bySection: Record<string, number>;
  byProvenance: Record<Provenance, number>;
  bySourceId: Record<string, number>;
  images: string[];
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const questionFiles = readdirSync(QUESTIONS_DIR)
  .filter((file) => file.endsWith(".json"))
  .sort();
const reference = readJson<ReferenceManifest>(join(BANK_DIR, "MANIFEST.json"));
const derived = readJson<DerivedManifest>(join(GENERATED_DIR, "manifest.json"));

/** Todas as questões, validadas pelo contrato — base dos testes de integridade. */
const questionsByType = new Map<TaskType, Question[]>();
for (const file of questionFiles) {
  const type = file.replace(/\.json$/, "") as TaskType;
  questionsByType.set(
    type,
    parseQuestions(readJson<unknown>(join(QUESTIONS_DIR, file)), `bank[${type}]`),
  );
}
const allQuestions = [...questionsByType.values()].flat();

describe("banco versionado — arquivos copiados do pacote", () => {
  it("tem 22 arquivos de tipo, MANIFEST.json, aliases.json e 20 imagens", () => {
    expect(questionFiles).toHaveLength(22);
    expect(existsSync(join(BANK_DIR, "MANIFEST.json"))).toBe(true);
    expect(existsSync(join(BANK_DIR, "aliases.json"))).toBe(true);
    const images = readdirSync(IMAGES_DIR).filter((file) => file.endsWith(".png"));
    expect(images).toHaveLength(20);
    expect(readJson<Record<string, string>>(join(BANK_DIR, "aliases.json"))).toEqual({});
  });

  it("os 22 tipos do banco são exatamente os 22 tipos de `@/domain` e do exam-spec", () => {
    const bankTypes = questionFiles.map((file) => file.replace(/\.json$/, ""));
    expect([...bankTypes].sort()).toEqual([...TASK_TYPES].sort());
    expect(EXAM_TASKS.map((task) => task.id).sort()).toEqual([...TASK_TYPES].sort());
  });
});

describe("manifesto derivado — números, nunca digitados", () => {
  it("o script gera o manifesto e termina com OK", () => {
    const output = execFileSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: "utf8" });
    expect(output).toContain("OK — manifesto derivado idêntico ao MANIFEST.json do pacote.");
    expect(output).toContain("2823");
  });

  it("total, por tipo, por seção e proveniência batem com o MANIFEST.json", () => {
    expect(derived.totals.questions).toBe(reference.totalQuestoes);
    expect(derived.totals.types).toBe(reference.tiposComBanco);
    expect(derived.totals.images).toBe(reference.imagens);
    expect(
      Object.fromEntries(Object.entries(derived.byType).map(([type, data]) => [type, data.count])),
    ).toEqual(reference.contagemPorTipo);
    expect(derived.bySection).toEqual(reference.contagemPorSecao);
    expect(derived.byProvenance).toEqual(reference.proveniencia);
    expect(derived.bySourceId).toEqual(reference.itensPorFonte);
  });

  it("a seção de cada tipo derivada pelo script é a de `SECTION_BY_TYPE`", () => {
    for (const type of TASK_TYPES) {
      expect(derived.byType[type]?.section, `seção de ${type}`).toBe(SECTION_BY_TYPE[type]);
    }
  });

  it("o script não contém a contagem literal do banco (anti-número-envelhecido)", () => {
    const source = readFileSync(SCRIPT, "utf8");
    const counts = [
      String(reference.totalQuestoes),
      ...Object.values(reference.contagemPorTipo).map(String),
    ].filter((value) => value !== "1" && value !== "20" && value.length > 1);
    for (const count of new Set(counts)) {
      // Fronteira numérica: evita falso positivo em "sha256", "slice(0, 12)" etc.
      const literal = new RegExp(`(?<![\\w.])${count}(?![\\w.])`);
      expect(literal.test(source), `script contém a contagem literal ${count}`).toBe(false);
    }
  });

  it("o índice gerado cobre exatamente os itens do banco", () => {
    const index = readJson<{ items: Array<{ id: string; type: string; section: string }> }>(
      join(GENERATED_DIR, "index.json"),
    );
    expect(index.items).toHaveLength(reference.totalQuestoes);
    const ids = new Set(index.items.map((item) => item.id));
    expect(ids.size).toBe(reference.totalQuestoes);
    for (const item of index.items) {
      expect(item.section).toBe(SECTION_BY_TYPE[item.type as TaskType]);
    }
  });
});

describe("contrato de domínio × itens reais", () => {
  it("todos os 2.823 itens passam em parseQuestions", () => {
    expect(allQuestions).toHaveLength(reference.totalQuestoes);
  });

  it("cada tipo tem a contagem do manifesto e a seção derivada correta", () => {
    for (const type of TASK_TYPES) {
      const questions = questionsByType.get(type) ?? [];
      expect(questions, `contagem de ${type}`).toHaveLength(reference.contagemPorTipo[type] ?? -1);
      for (const question of questions) {
        expect(question.section).toBe(SECTION_BY_TYPE[type]);
        expect(question.canonicalId).toBe(question.id);
      }
    }
  });

  it("proveniência por item soma o manifesto e só usa os três níveis", () => {
    const byProvenance: Record<string, number> = {};
    for (const question of allQuestions) {
      expect(["verificada", "corroborada", "comunitaria"]).toContain(question.provenance);
      byProvenance[question.provenance] = (byProvenance[question.provenance] ?? 0) + 1;
    }
    expect(byProvenance).toEqual(reference.proveniencia);
  });

  it("os ids são únicos no banco inteiro (zero duplicatas)", () => {
    const ids = new Set(allQuestions.map((question) => question.id));
    expect(ids.size).toBe(allQuestions.length);
    expect(allQuestions.length).toBe(
      new Set(allQuestions.map((question) => question.canonicalId)).size,
    );
  });
});

describe("imagens do Describe Image", () => {
  const describeImages = allQuestions.filter(
    (question): question is DescribeImageQuestion => question.type === "describe_image",
  );

  it("cada item tem licença, atribuição e imagem existente em public/di", () => {
    expect(describeImages).toHaveLength(20);
    for (const question of describeImages) {
      expect(question.data.alt.length, `${question.id} sem alt`).toBeGreaterThan(0);
      expect(question.source.license, `${question.id} sem licença`).toBeTruthy();
      expect(question.source.attribution, `${question.id} sem atribuição`).toBeTruthy();
      expect(question.data.image.startsWith("/di/")).toBe(true);
      const file = join(IMAGES_DIR, question.data.image.slice("/di/".length));
      expect(existsSync(file), `imagem ausente: ${question.data.image}`).toBe(true);
    }
  });

  it("não há imagem órfã em public/di", () => {
    const referenced = new Set(describeImages.map((question) => question.data.image));
    const onDisk = readdirSync(IMAGES_DIR)
      .filter((file) => file.endsWith(".png"))
      .map((file) => `/di/${file}`);
    expect([...onDisk].sort()).toEqual([...referenced].sort());
  });
});
