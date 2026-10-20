/**
 * Formatação de dados do `exam-spec` para a ficha do tipo (Fase 4 — s5-pratica).
 *
 * Por que separado: a ficha precisa mostrar tempos e contagens oficiais em pt-BR sem
 * que cada componente invente a sua leitura. Tudo aqui é `exam-spec` puro — nenhum
 * número do banco de questões e nenhuma constante de tempo duplicada.
 *
 * Os rótulos de janela de resposta são deliberadamente explícitos: "tempo da seção"
 * nunca pode ser lido como "cronômetro por questão", e "acompanha o áudio" nunca pode
 * virar um número inventado.
 */

import { EXAM_SOURCES, type ExamTaskSpec, type ResponseWindow } from "@/data/exam-spec";
import { SECTION_LABELS } from "@/lib/app/catalogo";
import { formatDuration } from "@/lib/app/practice-timer";
import type { Section } from "@/domain";

/** Nome da seção em inglês + leitura em pt-BR (vocabulário único do catálogo). */
export function sectionLabel(section: Section): { label: string; labelPt: string } {
  const labels = SECTION_LABELS[section];
  return { label: labels.label, labelPt: labels.labelPt };
}

/** Quantidade de tarefas na prova: `2` ou `6–7` (faixa oficial). */
export function formatTaskCount(count: ExamTaskSpec["scoredTasksInExam"]): string {
  if (typeof count === "number") return String(count);
  return `${count[0]}–${count[1]}`;
}

/** Preparação em texto; tipos sem preparação dizem isso, não "0 s". */
export function formatPreparation(spec: ExamTaskSpec): string {
  if (spec.preparationSeconds === undefined) return "Sem preparação";
  return formatDuration(spec.preparationSeconds * 1000);
}

/** Janela de resposta em texto, distinguindo tempo fixo de tempo de seção/áudio. */
export function formatResponseWindow(window: ResponseWindow | undefined): string {
  if (window === undefined) return "Sem janela de resposta definida";
  if (typeof window === "number") return formatDuration(window * 1000);
  if (window === "until_audio") return "Acompanha o áudio do item";
  return "Tempo compartilhado da seção";
}

/** Explicação curta da janela de resposta (para a ficha e o cronômetro). */
export function explainResponseWindow(window: ResponseWindow | undefined): string {
  if (window === undefined) return "Este tipo não define janela de resposta própria.";
  if (typeof window === "number") return "Tempo fixo de resposta para cada item.";
  if (window === "until_audio") {
    return "A resposta acompanha o áudio do item: não há um número fixo de segundos.";
  }
  return "Não há cronômetro por item: vale o tempo total da seção.";
}

/** Habilidades pontuadas, na ordem em que o formato oficial as lista. */
export function formatScoredSkills(skills: readonly Section[]): string {
  return skills.map((skill) => SECTION_LABELS[skill].label).join(" + ");
}

/** Lista de habilidades com leitura em pt-BR (ex.: "Speaking (fala) + Reading (leitura)"). */
export function formatScoredSkillsDetailed(skills: readonly Section[]): string {
  return skills
    .map((skill) => `${SECTION_LABELS[skill].label} (${SECTION_LABELS[skill].labelPt})`)
    .join(" + ");
}

/**
 * Data de consulta das fontes oficiais (a mais recente registrada em `EXAM_SOURCES`),
 * formatada como dia/mês/ano. Vem dos dados, nunca digitada aqui.
 */
export function formatSourcesDate(): string | null {
  const dates = EXAM_SOURCES.map((source) => source.consultedAt)
    .filter(Boolean)
    .sort();
  const latest = dates.at(-1);
  if (latest === undefined) return null;
  const [year, month, day] = latest.split("-");
  if (year === undefined || month === undefined || day === undefined) return latest;
  return `${day}/${month}/${year}`;
}
