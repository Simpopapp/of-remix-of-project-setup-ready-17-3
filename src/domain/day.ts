/**
 * Chaves de dia local — contrato de datas do produto.
 *
 * Regra do PRD central (§6.2/§9): toda data de estudo (próxima revisão do SRS, dia
 * revisado, plano do dia) é uma chave `YYYY-MM-DD` no fuso do aluno, NUNCA um
 * instante UTC (`toISOString().slice(0,10)`), porque um passo de 24 h não pode ser
 * quebrado por horário de verão nem por diferença de fuso.
 *
 * Consumidores: Fase 3 (storage/SRS), Fase 7 (fila do dia), Fase 8 (plano/relatório).
 * Este módulo é puro: zero I/O, zero dependências externas.
 */

/** `YYYY-MM-DD` no fuso local do dispositivo. Ver `localDayKey`. */
export type LocalDayKey = string;

/** Formato aceito: quatro dígitos de ano, dois de mês, dois de dia. */
export const LOCAL_DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * Converte um `Date` na chave de dia local (`YYYY-MM-DD`) do fuso do dispositivo.
 *
 * Usa os getters locais (`getFullYear`/`getMonth`/`getDate`). NÃO use
 * `toISOString().slice(0, 10)`: em fusos a oeste de UTC isso devolve o dia anterior
 * à noite e o dia seguinte em fusos a leste nas primeiras horas.
 */
export function localDayKey(date: Date = new Date()): LocalDayKey {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("localDayKey: data inválida");
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Variante que aceita um instante ISO e devolve `null` se o instante for inválido. */
export function localDayKeyOfTimestamp(isoTimestamp: string): LocalDayKey | null {
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) return null;
  return localDayKey(new Date(parsed));
}

/**
 * Valida uma chave de dia local de verdade: formato `YYYY-MM-DD` E data de
 * calendário existente (rejeita `2026-02-31`, `2026-13-01` e instantes ISO).
 */
export function isLocalDayKey(value: unknown): value is LocalDayKey {
  if (typeof value !== "string") return false;
  const match = LOCAL_DAY_KEY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Ao meio-dia local para não colidir com transições de horário de verão.
  const probe = new Date(year, month - 1, day, 12, 0, 0, 0);
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
}

/**
 * Converte a chave no `Date` do meio-dia local daquele dia.
 * Meio-dia (não meia-noite) porque em dias de transição de horário de verão a
 * meia-noite pode não existir ou ser ambígua.
 */
export function localDayKeyToDate(key: LocalDayKey): Date | null {
  if (!isLocalDayKey(key)) return null;
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/**
 * Soma (ou subtrai) dias de calendário a uma chave, preservando o dia local.
 *
 * Ancorado no meio-dia local: `2026-03-07 + 1` continua `2026-03-08` mesmo num dia
 * de 23 h (início do horário de verão) e `+2` chega a `2026-03-09`.
 */
export function addLocalDays(key: LocalDayKey, days: number): LocalDayKey {
  if (!isLocalDayKey(key)) {
    throw new TypeError(`addLocalDays: chave de dia local inválida: ${String(key)}`);
  }
  if (!Number.isInteger(days)) {
    throw new TypeError(`addLocalDays: dias precisa ser inteiro, recebeu ${String(days)}`);
  }
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  const shifted = new Date(year, month - 1, day + days, 12, 0, 0, 0);
  return localDayKey(shifted);
}

/**
 * Diferença em dias de calendário entre duas chaves (`b - a`).
 * Positivo quando `b` é depois de `a`. Ancorado no meio-dia local.
 */
export function diffLocalDays(a: LocalDayKey, b: LocalDayKey): number {
  const start = localDayKeyToDate(a);
  const end = localDayKeyToDate(b);
  if (!start || !end) {
    throw new TypeError(`diffLocalDays: chave de dia local inválida (${String(a)}, ${String(b)})`);
  }
  // Arredonda para absorver a hora a menos/mais de dias de transição de DST.
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** Comparador lexicográfico seguro para `YYYY-MM-DD` (ordem cronológica). */
export function compareLocalDayKeys(a: LocalDayKey, b: LocalDayKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
