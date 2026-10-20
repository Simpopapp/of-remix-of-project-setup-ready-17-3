/**
 * Testes do catálogo unificado (F4.2.1 — s3-catalogo).
 *
 * O que este arquivo prova:
 *
 * 1. `deriveCatalog` cobre **exatamente** os tipos do contrato (`TASK_TYPES`), na ordem
 *    oficial do exame (`EXAM_TASK_ORDER`) — sem tipo inventado e sem tipo esquecido.
 * 2. Toda contagem/palavra vem do manifesto: com um manifesto **sintético** (números
 *    diferentes dos do banco real), a saída reflete o sintético. É o teste de prevenção
 *    contra número envelhecido: nada aqui depende de constante digitada.
 * 3. `sparse` segue o limiar declarado, e "sem conteúdo" é detectável por `isComingSoon`.
 * 4. `href` aponta para a prática do próprio tipo.
 * 5. Agrupamento e resumo são somas derivadas das entradas (e preservam a ordem do exame).
 * 6. Os nomes pt-BR do catálogo não divergem de `exam-spec.ts` (contrato de vocabulário).
 * 7. O manifesto real do banco atravessa a derivação sem lançar (integração, sem literal).
 *
 * Nenhum número do banco real é digitado neste arquivo: os valores usados são sintéticos
 * (7, 60, 61, 0) escolhidos para exercitar o limiar, não para afirmar o tamanho do banco.
 */

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { EXAM_TASK_ORDER } from "@/data/exam-spec";
import { loadManifest, type BankManifest, type BankTypeManifest } from "@/data/loader";
import { SECTIONS, SECTION_BY_TYPE, TASK_TYPES, type TaskType } from "@/domain";
import {
  SPARSE_COUNT_THRESHOLD,
  TASK_DISPLAY_NAMES,
  deriveCatalog,
  groupCatalog,
  isComingSoon,
  officialTaskNames,
  practiceHref,
  summarizeCatalog,
} from "@/lib/app/catalogo";

/* ------------------------------------------------------------------ */
/* Manifesto sintético                                                 */
/* ------------------------------------------------------------------ */

interface SyntheticSpec {
  /** contagem por tipo; tipos ausentes recebem `defaultCount` */
  counts?: Partial<Record<TaskType, number>>;
  defaultCount?: number;
  words?: Partial<Record<TaskType, number>>;
  defaultWords?: number;
}

/**
 * Manifesto mínimo e coerente com o contrato de `BankManifest`, montado a partir de
 * `TASK_TYPES`/`SECTION_BY_TYPE` do domínio (não de uma lista paralela).
 */
function syntheticManifest(spec: SyntheticSpec = {}): BankManifest {
  const defaultCount = spec.defaultCount ?? 10;
  const defaultWords = spec.defaultWords ?? 100;

  const byType = {} as Record<TaskType, BankTypeManifest>;
  for (const type of TASK_TYPES) {
    const count = spec.counts?.[type] ?? defaultCount;
    // Proveniência coerente com a contagem: a soma tem de fechar com o total.
    byType[type] = {
      count,
      section: SECTION_BY_TYPE[type],
      words: spec.words?.[type] ?? defaultWords,
      byProvenance: { verificada: count, corroborada: 0, comunitaria: 0 },
    };
  }

  const bySection = { speaking: 0, writing: 0, reading: 0, listening: 0 };
  for (const type of TASK_TYPES) bySection[SECTION_BY_TYPE[type]] += byType[type].count;

  const questions = TASK_TYPES.reduce((sum, type) => sum + byType[type].count, 0);
  const words = TASK_TYPES.reduce((sum, type) => sum + byType[type].words, 0);

  return {
    format: "pte-master-hub-bank-manifest",
    version: 1,
    generatedBy: "teste-sintetico",
    source: { package: "synthetic", packageVersion: 1, generatedAt: "2000-01-01" },
    totals: {
      questions,
      types: TASK_TYPES.length,
      images: 0,
      sources: 1,
      sourceDomains: 1,
      words,
    },
    byType,
    bySection,
    byProvenance: { verificada: questions, corroborada: 0, comunitaria: 0 },
    bySourceId: { sintetica: questions },
    byDomain: { "exemplo.invalid": questions },
    images: [],
  };
}

/* ------------------------------------------------------------------ */
/* Cobertura e ordem                                                   */
/* ------------------------------------------------------------------ */

describe("deriveCatalog — cobertura e ordem (F4.2.1)", () => {
  it("cobre exatamente os tipos do contrato, uma única vez cada", () => {
    const entries = deriveCatalog(syntheticManifest());
    const types = entries.map((entry) => entry.type);

    expect(types).toHaveLength(TASK_TYPES.length);
    expect(new Set(types).size).toBe(TASK_TYPES.length);
    expect([...types].sort()).toEqual([...TASK_TYPES].sort());
  });

  it("segue a ordem oficial do exame (EXAM_TASK_ORDER), estável entre chamadas", () => {
    const manifest = syntheticManifest();
    const first = deriveCatalog(manifest).map((entry) => entry.type);
    const second = deriveCatalog(manifest).map((entry) => entry.type);

    expect(first).toEqual([...EXAM_TASK_ORDER]);
    expect(second).toEqual(first);
  });

  it("mantém as seções na ordem em que o exame as apresenta", () => {
    const sections = groupCatalog(deriveCatalog(syntheticManifest())).map((group) => group.section);
    const expected = [...new Set(EXAM_TASK_ORDER.map((type) => SECTION_BY_TYPE[type as TaskType]))];

    expect(sections).toEqual(expected);
    expect(new Set(sections)).toEqual(new Set(SECTIONS));
  });
});

/* ------------------------------------------------------------------ */
/* Derivação (prevenção de número envelhecido)                         */
/* ------------------------------------------------------------------ */

describe("deriveCatalog — derivação do manifesto (prevenção de número envelhecido)", () => {
  it("reflete o manifesto injetado, não uma constante do código", () => {
    const counts: Partial<Record<TaskType, number>> = {
      read_aloud: 7,
      wfd: 1234,
      answer_short: 0,
    };
    const manifest = syntheticManifest({ counts, defaultCount: 42 });
    const entries = deriveCatalog(manifest);

    for (const entry of entries) {
      expect(entry.count).toBe(manifest.byType[entry.type].count);
      expect(entry.words).toBe(manifest.byType[entry.type].words);
    }

    // Dois manifestos diferentes produzem catálogos diferentes: prova de que a saída
    // não é uma tabela digitada.
    const otherCounts: Partial<Record<TaskType, number>> = { read_aloud: 999, wfd: 3 };
    const other = deriveCatalog(syntheticManifest({ counts: otherCounts, defaultCount: 5 }));
    expect(other.find((entry) => entry.type === "read_aloud")?.count).toBe(999);
    expect(other.find((entry) => entry.type === "wfd")?.count).toBe(3);
    expect(other.find((entry) => entry.type === "repeat_sentence")?.count).toBe(5);
  });

  it("propaga a seção do domínio (nunca uma seção digitada na tela)", () => {
    for (const entry of deriveCatalog(syntheticManifest())) {
      expect(entry.section).toBe(SECTION_BY_TYPE[entry.type]);
    }
  });

  it("falha alto quando o manifesto não cobre um tipo do contrato", () => {
    const manifest = syntheticManifest();
    const broken = { ...manifest, byType: { ...manifest.byType } } as BankManifest;
    delete (broken.byType as Partial<Record<TaskType, BankTypeManifest>>).read_aloud;

    expect(() => deriveCatalog(broken)).toThrow(/read_aloud/);
  });

  it("falha alto quando a contagem do manifesto é inválida", () => {
    const manifest = syntheticManifest();
    const broken = {
      ...manifest,
      byType: {
        ...manifest.byType,
        wfd: { ...manifest.byType.wfd, count: -1 },
      },
    } as BankManifest;

    expect(() => deriveCatalog(broken)).toThrow(/wfd/);
  });
});

/* ------------------------------------------------------------------ */
/* Cobertura limitada (sparse)                                         */
/* ------------------------------------------------------------------ */

describe("deriveCatalog — cobertura limitada e ausência de conteúdo", () => {
  it("marca 'sparse' abaixo do limiar e 'available' no limiar e acima", () => {
    const manifest = syntheticManifest({
      defaultCount: SPARSE_COUNT_THRESHOLD,
      counts: {
        read_aloud: SPARSE_COUNT_THRESHOLD - 1,
        wfd: SPARSE_COUNT_THRESHOLD + 1,
        rts: 0,
      },
    });
    const byType = new Map(deriveCatalog(manifest).map((entry) => [entry.type, entry]));

    expect(byType.get("read_aloud")?.status).toBe("sparse");
    expect(byType.get("rts")?.status).toBe("sparse"); // zero é cobertura limitada, não "disponível"
    expect(byType.get("wfd")?.status).toBe("available");
    expect(byType.get("swt")?.status).toBe("available"); // exatamente no limiar
  });

  it("expõe 'sem conteúdo' sem confundir com disponibilidade", () => {
    const manifest = syntheticManifest({ defaultCount: 10, counts: { describe_image: 0 } });
    const entry = deriveCatalog(manifest).find((item) => item.type === "describe_image");

    expect(entry).toBeDefined();
    expect(entry && isComingSoon(entry)).toBe(true);
    expect(entry?.status).not.toBe("available");
  });

  it("aponta o href para a prática do próprio tipo", () => {
    for (const entry of deriveCatalog(syntheticManifest())) {
      expect(entry.href).toBe(`/praticar/${entry.type}`);
      expect(entry.href).toBe(practiceHref(entry.type));
    }
  });
});

/* ------------------------------------------------------------------ */
/* Agrupamento e resumo                                                */
/* ------------------------------------------------------------------ */

describe("groupCatalog / summarizeCatalog — somas derivadas", () => {
  it("soma itens e palavras por seção a partir das entradas", () => {
    const manifest = syntheticManifest({ defaultCount: 11, defaultWords: 13 });
    const entries = deriveCatalog(manifest);
    const groups = groupCatalog(entries);

    for (const group of groups) {
      expect(group.entries.every((entry) => entry.section === group.section)).toBe(true);
      expect(group.types).toBe(group.entries.length);
      expect(group.questions).toBe(group.entries.reduce((sum, entry) => sum + entry.count, 0));
      expect(group.words).toBe(group.entries.reduce((sum, entry) => sum + entry.words, 0));
      expect(group.sparseTypes).toBe(
        group.entries.filter((entry) => entry.status === "sparse").length,
      );
    }

    const groupQuestions = groups.reduce((sum, group) => sum + group.questions, 0);
    const groupTypes = groups.reduce((sum, group) => sum + group.types, 0);
    expect(groupQuestions).toBe(manifest.totals.questions);
    expect(groupTypes).toBe(TASK_TYPES.length);
  });

  it("resume o catálogo inteiro sem constante", () => {
    const manifest = syntheticManifest({ defaultCount: 9, counts: { sgd: 0 } });
    const entries = deriveCatalog(manifest);
    const summary = summarizeCatalog(entries);

    expect(summary.types).toBe(TASK_TYPES.length);
    expect(summary.typesWithContent).toBe(TASK_TYPES.length - 1);
    expect(summary.questions).toBe(manifest.totals.questions);
    expect(summary.words).toBe(manifest.totals.words);
    expect(summary.sparseTypes).toBe(entries.filter((entry) => entry.status === "sparse").length);
  });

  it("devolve seções vazias quando não há entradas (estado degenerado, sem crash)", () => {
    expect(groupCatalog([])).toEqual([]);
    expect(summarizeCatalog([])).toMatchObject({ types: 0, questions: 0, words: 0 });
  });
});

/* ------------------------------------------------------------------ */
/* Contrato de vocabulário                                             */
/* ------------------------------------------------------------------ */

describe("TASK_DISPLAY_NAMES — contrato com exam-spec.ts", () => {
  it("tem um nome para cada tipo e nenhum a mais", () => {
    expect(Object.keys(TASK_DISPLAY_NAMES).sort()).toEqual([...TASK_TYPES].sort());
  });

  it("contém o nome oficial e a leitura em pt-BR de cada tarefa", () => {
    const official = officialTaskNames();
    expect(official.size).toBe(TASK_TYPES.length);

    for (const type of TASK_TYPES) {
      const spec = official.get(type);
      expect(spec, `tipo ausente em EXAM_TASKS: ${type}`).toBeDefined();
      if (spec === undefined) continue;

      const display = TASK_DISPLAY_NAMES[type];
      expect(display).toContain(spec.name);
      expect(display).toContain(spec.namePt);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Integração com o manifesto real (sem literal)                       */
/* ------------------------------------------------------------------ */

describe("deriveCatalog — manifesto real do banco", () => {
  it("atravessa a derivação com os tipos e o total do manifesto", async () => {
    const manifest = await loadManifest();
    const entries = deriveCatalog(manifest);
    const summary = summarizeCatalog(entries);

    expect(entries).toHaveLength(Object.keys(manifest.byType).length);
    expect(summary.types).toBe(TASK_TYPES.length);
    expect(summary.questions).toBe(manifest.totals.questions);
    expect(summary.words).toBe(manifest.totals.words);
    expect(entries.map((entry) => entry.type)).toEqual([...EXAM_TASK_ORDER]);
    expect(entries.every((entry) => entry.count >= 0)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Smoke test de SSR da rota /catalogo                                 */
/* ------------------------------------------------------------------ */

/**
 * Prova de que a página monta no servidor com o manifesto real e que o estado
 * "prática em breve" é honesto: enquanto a rota `/praticar/$type` não estiver no
 * route tree, o card NÃO oferece um link para lugar nenhum — só o aviso.
 */
describe("/catalogo — renderização no servidor", () => {
  it("renderiza seções, cards e um destino de prática existente ou o aviso honesto", async () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
      history: createMemoryHistory({ initialEntries: ["/catalogo"] }),
    });
    await router.load();

    const html = renderToString(createElement(RouterProvider, { router }));

    expect(html).toContain("As tarefas pontuadas do PTE Academic");
    expect(html).toContain("Read Aloud — Ler em voz alta");
    expect(html).toContain("Speaking");

    // ou a rota de prática já existe (link real) ou o card diz que ela ainda não chegou
    const hasPracticeLink = html.includes("/praticar/read_aloud");
    const hasHonestFallback = html.includes("Prática em breve");
    expect(hasPracticeLink || hasHonestFallback).toBe(true);

    router.history.destroy();
  });
});
