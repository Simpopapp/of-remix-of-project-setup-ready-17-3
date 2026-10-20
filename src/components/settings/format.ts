/**
 * Formatação de números/datas da tela de Ajustes (Fase 4 — s4).
 *
 * Módulo puro: nenhuma dependência de React, navegador ou IndexedDB. Tudo o que
 * o aluno lê sobre o próprio armazenamento é derivado dos contratos da Fase 3
 * (`QuotaLevel`, `MigrationFailureReason`) — nunca inventamos porcentagem nem
 * diagnóstico sem estimativa.
 */

import type { QuarantineReason } from "@/lib/app/backup-io";
import {
  QUOTA_CRITICAL_RATIO,
  QUOTA_WARN_RATIO,
  type QuotaEstimate,
  type QuotaLevel,
} from "@/lib/app/media";

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Bytes legíveis em pt-BR (base 1024, como o navegador reporta). */
export function formatBytes(bytes: number): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  let value = safe;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const fractionDigits = unit === 0 || value >= 100 ? 0 : 1;
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(value);
  return `${formatted} ${UNITS[unit] ?? "B"}`;
}

/** 0–1 → "42%" (arredonda para baixo: nunca superestima o uso). */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "—";
  const clamped = Math.min(1, Math.max(0, ratio));
  return `${Math.floor(clamped * 100)}%`;
}

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

/** Data/hora legível; entrada inválida vira "data desconhecida". */
export function formatDateTime(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "data desconhecida";
  try {
    return dateTimeFormatter.format(new Date(parsed));
  } catch {
    return "data desconhecida";
  }
}

/**
 * Nível a partir da estimativa real do navegador. `null` (sem estimativa) nunca
 * é promovido a "ok": vira `unknown`.
 */
export function levelFromEstimate(estimate: QuotaEstimate | null): QuotaLevel {
  if (estimate === null) return "unknown";
  if (estimate.ratio >= QUOTA_CRITICAL_RATIO) return "critical";
  if (estimate.ratio >= QUOTA_WARN_RATIO) return "warn";
  return "ok";
}

export function quotaLevelLabel(level: QuotaLevel): string {
  switch (level) {
    case "ok":
      return "Espaço saudável";
    case "warn":
      return "Espaço ficando cheio";
    case "critical":
      return "Espaço quase esgotado";
    default:
      return "Sem estimativa";
  }
}

/**
 * Explicação honesta de cada nível. `unknown` nunca é disfarçado de "ok":
 * significa que o navegador não informa a quota.
 */
export function quotaLevelAdvice(level: QuotaLevel): string {
  switch (level) {
    case "ok":
      return "Há espaço livre para as próximas gravações de fala.";
    case "warn":
      return "Considere exportar um backup e remover gravações antigas antes de gravar novas respostas.";
    case "critical":
      return "Exporte um backup agora: uma gravação nova pode não caber neste dispositivo.";
    default:
      return "Este navegador não informa o espaço disponível, então não há porcentagem confiável para mostrar. A gravação continua permitida e pode falhar se o armazenamento estiver cheio.";
  }
}

/** Motivo da quarentena em linguagem de aluno (sem jargão de schema). */
export function describeQuarantineReason(reason: QuarantineReason): string {
  switch (reason) {
    case "unreadable_json":
      return "O arquivo não é um JSON válido (talvez tenha sido editado ou corrompido no download).";
    case "not_object":
      return "O arquivo não tem o formato de um backup deste app.";
    case "wrong_format":
      return "O arquivo é de outro produto ou de uma versão incompatível.";
    case "missing_version":
      return "O arquivo não informa a versão do backup.";
    case "invalid_version":
      return "O arquivo informa uma versão que este app não reconhece.";
    case "future_version":
      return "Este backup foi criado por uma versão mais nova do app. Atualize o app para lê-lo.";
    case "corrupt_payload":
      return "O arquivo está íntegro como JSON, mas o conteúdo do backup está corrompido.";
    default:
      return "O arquivo não pôde ser lido como backup.";
  }
}

/** Nome de arquivo com dia local, sem caracteres problemáticos. */
export function backupFileName(prefix: string, dayKey: string): string {
  const safeDay = /^\d{4}-\d{2}-\d{2}$/.test(dayKey) ? dayKey : "sem-data";
  return `${prefix}-${safeDay}.json`;
}

/** `YYYY-MM-DD` → "20 de novembro de 2026" (data de calendário, sem fuso). */
export function formatDayKey(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (match === null) return key;
  const year = Number(match[1] ?? 0);
  const month = Number(match[2] ?? 1);
  const day = Number(match[3] ?? 1);
  const date = new Date(year, month - 1, day);
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(date);
  } catch {
    return key;
  }
}
