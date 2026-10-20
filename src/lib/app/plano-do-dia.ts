/**
 * Plano do dia — lógica pura da Home (F4.1).
 *
 * Problema que resolve: a Home precisa responder "o que eu estudo hoje?" sem
 * inventar medição. Até a Fase 8 não existe estimativa por habilidade nem
 * prontidão, então o plano só pode usar fatos locais que o app realmente tem:
 * a fila de revisão vencida (SRS da Fase 3), o histórico de tentativas por
 * seção e a meta/data da prova escolhidas pelo aluno.
 *
 * Regras (PRD do pacote §F4.1):
 * 1. `dueCount > 0` → primeiro item é "revisar a fila do dia" (`/sessoes`).
 *    `dueCount` nulo/desconhecido NUNCA vira item de revisão falso.
 * 2. Seção sem nenhuma tentativa registrada → item "explorar" na seção menos
 *    coberta (menor contagem; empate na ordem oficial das seções).
 * 3. `examDate` ausente → convite para Ajustes; data já passada → aviso para
 *    atualizar (o plano não pode fingir um prazo que já venceu).
 * 4. Nada de estimativa, prontidão, nota prevista ou "desempenho": só fila,
 *    cobertura e atalhos.
 * 5. No máximo `DAY_PLAN_MAX_ITEMS` itens, ordem estável — mesma entrada,
 *    mesma saída (sem `Date.now()`, sem aleatoriedade).
 *
 * `todayKey` existe no contrato para a comparação de prazo (regra 3) e é
 * sempre uma chave de dia local (`YYYY-MM-DD`), nunca timestamp UTC.
 *
 * Função pura: zero I/O. A Home lê os snapshots/ajustes e passa os números;
 * a Fase 8 pode reutilizar o mesmo contrato com dados mais ricos.
 */

import {
  SECTIONS,
  SECTION_BY_TYPE,
  compareLocalDayKeys,
  isLocalDayKey,
  type QuestionSnapshot,
  type Section,
} from "@/domain";

import type { AppSettings } from "./settings";

/** Teto de itens do plano (PRD §F4.1). */
export const DAY_PLAN_MAX_ITEMS = 4;

/**
 * Nomes das seções usados no texto do plano (nomes oficiais em inglês; a
 * interface é pt-BR no resto das frases).
 *
 * Não reutiliza `SECTION_LABELS` de `catalogo.ts` de propósito: aquele mapa é
 * do catálogo (com descrições longas) e o plano precisa só do nome curto. Nomes
 * diferentes evitam ambiguidade entre os dois módulos.
 */
export const SECTION_DISPLAY_NAMES: Record<Section, string> = {
  speaking: "Speaking",
  writing: "Writing",
  reading: "Reading",
  listening: "Listening",
};

export type DayPlanItemKind = "review" | "practice" | "explore";

export interface DayPlanItem {
  kind: DayPlanItemKind;
  title: string;
  description: string;
  href: string;
}

export interface DayPlanInput {
  /** ajustes do aluno (contrato da fundação) */
  settings: AppSettings;
  /** revisões vencidas hoje; `null` = desconhecido (nunca vira 0 falso) */
  dueCount: number | null;
  /** tentativas registradas por seção (0 = sem histórico) */
  practiceBySection: Record<Section, number>;
  /** chave de dia local do aluno (`YYYY-MM-DD`) */
  todayKey: string;
}

/** Record zerado por seção — base para agregar snapshots. */
export function emptyPracticeBySection(): Record<Section, number> {
  return { speaking: 0, writing: 0, reading: 0, listening: 0 };
}

function safeCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
}

/**
 * Agrega tentativas dos snapshots por seção.
 *
 * O snapshot é a fonte independente do log truncável (Fase 3), então é dele
 * que sai a cobertura local. Valores não finitos/negativos são tratados como
 * zero: snapshot vem de IndexedDB, ou seja, é dado não confiável.
 */
export function practiceBySectionFromSnapshots(
  snapshots: readonly QuestionSnapshot[],
): Record<Section, number> {
  const bySection = emptyPracticeBySection();
  for (const snapshot of snapshots) {
    // Anotação alarga para `Section | undefined`: protege contra snapshot
    // corrompido sem depender do tipo em tempo de compilação.
    const section: Section | undefined = SECTION_BY_TYPE[snapshot.questionType];
    if (section === undefined) continue;
    bySection[section] += safeCount(snapshot.attempts);
  }
  return bySection;
}

/** Seção com menor contagem; empate resolve na ordem oficial das seções. */
export function leastPracticedSection(bySection: Record<Section, number>): Section {
  let target: Section = SECTIONS[0];
  for (const section of SECTIONS) {
    if (safeCount(bySection[section]) < safeCount(bySection[target])) target = section;
  }
  return target;
}

/** Total de tentativas registradas (soma das seções). */
export function totalPracticeAttempts(bySection: Record<Section, number>): number {
  return SECTIONS.reduce((total, section) => total + safeCount(bySection[section]), 0);
}

function reviewItem(dueCount: number): DayPlanItem {
  const plural = dueCount === 1 ? "item" : "itens";
  return {
    kind: "review",
    title: `Revisar ${dueCount} ${plural} da fila do dia`,
    description:
      "Revisão espaçada vencida até hoje. Abra Sessões para retomar a fila de onde parou.",
    href: "/sessoes",
  };
}

function exploreItem(section: Section): DayPlanItem {
  const label = SECTION_DISPLAY_NAMES[section];
  return {
    kind: "explore",
    title: `Explorar ${label}`,
    description: `Ainda não há tentativas registradas em ${label} neste dispositivo. Veja os tipos da seção no catálogo e comece por onde fizer sentido.`,
    href: "/catalogo",
  };
}

function metaItem(settings: AppSettings, todayKey: string): DayPlanItem | null {
  const examDate = settings.meta.examDate;

  if (examDate === null) {
    return {
      kind: "practice",
      title: "Definir meta e data da prova",
      description:
        "Escolha a nota alvo e a data do exame para o plano do dia acompanhar o seu prazo.",
      href: "/ajustes",
    };
  }

  // `todayKey` inválido não autoriza afirmar que a data passou; nesse caso o
  // item simplesmente não entra (a Home já mostra a data em outro bloco).
  if (isLocalDayKey(todayKey) && compareLocalDayKeys(examDate, todayKey) < 0) {
    return {
      kind: "practice",
      title: "Atualizar a data da prova",
      description: `A data registrada (${examDate}) já passou. Atualize em Ajustes para o plano refletir o novo prazo.`,
      href: "/ajustes",
    };
  }

  return null;
}

function continueItem(section: Section, attempts: number): DayPlanItem {
  const label = SECTION_DISPLAY_NAMES[section];
  const plural = attempts === 1 ? "tentativa registrada" : "tentativas registradas";
  return {
    kind: "practice",
    title: `Continuar com ${label}`,
    description: `${label} é a seção com menos ${plural} neste dispositivo. Escolha um tipo no catálogo para manter o ritmo.`,
    href: "/catalogo",
  };
}

/**
 * Monta o plano do dia. Sempre devolve ao menos um item: quando não há fila,
 * seção nova ou pendência de meta, o convite é escolher um tipo no catálogo —
 * nunca uma métrica inventada.
 */
export function buildDayPlan(input: DayPlanInput): DayPlanItem[] {
  const items: DayPlanItem[] = [];
  const dueCount = input.dueCount === null ? null : safeCount(input.dueCount);
  const bySection = input.practiceBySection;

  if (dueCount !== null && dueCount > 0) {
    items.push(reviewItem(dueCount));
  }

  const untouchedSections = SECTIONS.filter((section) => safeCount(bySection[section]) === 0);

  if (untouchedSections.length > 0) {
    // Menor contagem entre TODAS as seções: uma seção com 0 tentativas é a
    // menos coberta por definição; o empate segue a ordem oficial.
    items.push(exploreItem(leastPracticedSection(bySection)));
  }

  const meta = metaItem(input.settings, input.todayKey);
  if (meta !== null) items.push(meta);

  if (untouchedSections.length === 0) {
    const target = leastPracticedSection(bySection);
    items.push(continueItem(target, safeCount(bySection[target])));
  }

  if (items.length === 0) {
    items.push({
      kind: "practice",
      title: "Escolher um tipo para praticar",
      description:
        "Seu plano não tem pendências agora. Escolha no catálogo o tipo que quer praticar.",
      href: "/catalogo",
    });
  }

  return items.slice(0, DAY_PLAN_MAX_ITEMS);
}
