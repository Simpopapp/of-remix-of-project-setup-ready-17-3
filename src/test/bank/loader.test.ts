/**
 * Contrato público do loader do banco (Fase 2 → Fase 4+).
 *
 * O que este arquivo prova, e por quê:
 * - `BANK_QUESTION_CHUNKS` tem 22 entradas e cada valor é uma **função** de import
 *   dinâmico — se alguém trocar por `eager: true`, os valores deixam de ser funções
 *   e o teste falha (prova real de lazy-load, não inspeção de string).
 * - `loadQuestionsByType` devolve a contagem do manifesto, só itens do tipo pedido,
 *   e cacheia (mesma identidade entre chamadas).
 * - `loadManifest` valida as coerências (soma por tipo/seção/proveniência = total).
 * - `loadBankIndex`, `loadAliases` e `bankImageUrl` cumprem o contrato enxuto.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { TASK_TYPES, type TaskType } from "@/domain";
import {
  BANK_QUESTION_CHUNKS,
  bankImageUrl,
  loadAliases,
  loadBankIndex,
  loadManifest,
  loadQuestionsByType,
  resetBankCache,
  type BankManifest,
} from "@/data/loader";

const MANIFEST_PATH = join(process.cwd(), "src", "data", "generated", "manifest.json");
const manifestOnDisk = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as BankManifest;

describe("chunks lazy por tipo", () => {
  it("registra um importador dinâmico para cada um dos 22 tipos", () => {
    const registered = Object.keys(BANK_QUESTION_CHUNKS);
    expect(registered.sort()).toEqual([...TASK_TYPES].sort());
    for (const type of TASK_TYPES) {
      expect(typeof BANK_QUESTION_CHUNKS[type], `chunk de ${type}`).toBe("function");
    }
  });

  it("cada importador devolve o array do tipo certo (sem carregar os outros)", async () => {
    const chunk = BANK_QUESTION_CHUNKS.lst_hcs;
    if (!chunk) throw new Error("chunk de lst_hcs ausente");
    const module = await chunk();
    const questions = module.default as Array<{ type: string }>;
    expect(Array.isArray(questions)).toBe(true);
    expect(questions).toHaveLength(manifestOnDisk.byType.lst_hcs.count);
    expect(questions.every((question) => question.type === "lst_hcs")).toBe(true);
  });
});

describe("loadQuestionsByType", () => {
  beforeEach(() => {
    resetBankCache();
  });

  it("devolve a contagem do manifesto para todos os 22 tipos", async () => {
    const counts: Record<string, number> = {};
    for (const type of TASK_TYPES) {
      const questions = await loadQuestionsByType(type);
      counts[type] = questions.length;
      expect(questions.every((question) => question.type === type)).toBe(true);
    }
    expect(counts).toEqual(
      Object.fromEntries(
        Object.entries(manifestOnDisk.byType).map(([type, data]) => [type, data.count]),
      ),
    );
  });

  it("lida com tipo pequeno (rts) e gigante (repeat_sentence) sem perder itens", async () => {
    const small = await loadQuestionsByType("rts");
    const large = await loadQuestionsByType("repeat_sentence");
    expect(small).toHaveLength(manifestOnDisk.byType.rts.count);
    expect(large).toHaveLength(manifestOnDisk.byType.repeat_sentence.count);
    expect(large.length).toBeGreaterThan(small.length);
    expect(new Set(large.map((question) => question.id)).size).toBe(large.length);
  });

  it("cacheia por tipo: a segunda chamada devolve a mesma lista", async () => {
    const first = await loadQuestionsByType("wfd");
    const second = await loadQuestionsByType("wfd");
    expect(second).toBe(first);
  });

  it("rejeita tipo que não pertence aos 22", async () => {
    await expect(loadQuestionsByType("personal_introduction" as TaskType)).rejects.toThrow(
      /Tipo de tarefa desconhecido/,
    );
    await expect(loadQuestionsByType("desconhecido" as TaskType)).rejects.toThrow(
      /Tipo de tarefa desconhecido/,
    );
  });
});

describe("loadManifest", () => {
  beforeEach(() => {
    resetBankCache();
  });

  it("devolve o manifesto validado e coerente com o arquivo gerado", async () => {
    const manifest = await loadManifest();
    expect(manifest.format).toBe("pte-master-hub-bank-manifest");
    expect(manifest.version).toBe(1);
    expect(manifest.totals.questions).toBe(manifestOnDisk.totals.questions);
    expect(manifest.totals.types).toBe(22);
    expect(Object.keys(manifest.byType)).toHaveLength(22);
    const sum = TASK_TYPES.reduce((total, type) => total + manifest.byType[type].count, 0);
    expect(sum).toBe(manifest.totals.questions);
    expect(Object.values(manifest.bySection).reduce((a, b) => a + b, 0)).toBe(
      manifest.totals.questions,
    );
    expect(Object.values(manifest.byProvenance).reduce((a, b) => a + b, 0)).toBe(
      manifest.totals.questions,
    );
  });

  it("cacheia o manifesto entre chamadas", async () => {
    const first = await loadManifest();
    const second = await loadManifest();
    expect(second).toBe(first);
  });

  it("todas as imagens do manifesto existem em public/di", async () => {
    const manifest = await loadManifest();
    expect(manifest.images).toHaveLength(manifest.totals.images);
    for (const image of manifest.images) {
      expect(existsSync(join(process.cwd(), "public", image.slice(1))), image).toBe(true);
    }
  });
});

describe("loadBankIndex e loadAliases", () => {
  beforeEach(() => {
    resetBankCache();
  });

  it("o índice tem um item por questão, com canonicalId = id e seção derivada", async () => {
    const index = await loadBankIndex();
    expect(index.items).toHaveLength(manifestOnDisk.totals.questions);
    expect(new Set(index.items.map((item) => item.id)).size).toBe(index.items.length);
    for (const item of index.items) {
      expect(item.canonicalId).toBe(item.id);
      expect(item.section).toBe(manifestOnDisk.byType[item.type].section);
      expect(item.domain.length).toBeGreaterThan(0);
    }
  });

  it("aliases.json atual é um mapa vazio (sem colisões no pacote)", async () => {
    await expect(loadAliases()).resolves.toEqual({});
  });
});

describe("bankImageUrl", () => {
  it("aceita o caminho do banco, o caminho relativo e o nome do arquivo", () => {
    expect(bankImageUrl("/di/life-expectancy.png")).toBe("/di/life-expectancy.png");
    expect(bankImageUrl("di/life-expectancy.png")).toBe("/di/life-expectancy.png");
    expect(bankImageUrl("life-expectancy.png")).toBe("/di/life-expectancy.png");
  });

  it("rejeita caminho vazio, traversal e subpasta não prevista", () => {
    expect(() => bankImageUrl("")).toThrow(/vazio/);
    expect(() => bankImageUrl("../secret.png")).toThrow(/inválido/);
    expect(() => bankImageUrl("/di/describe_image/life-expectancy.png")).toThrow(/inválido/);
  });
});
