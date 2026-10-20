/**
 * Contrato de chaves de dia local (`src/domain/day.ts`).
 *
 * O teste que importa é o de fuso: a chave é o dia do ALUNO, não o dia UTC.
 * A sandbox roda em UTC, por isso o teste troca `process.env.TZ` (suportado pelo
 * Node 22 em runtime) e restaura no `finally`.
 */

import { describe, expect, it } from "vitest";

import {
  addLocalDays,
  compareLocalDayKeys,
  diffLocalDays,
  isLocalDayKey,
  localDayKey,
  localDayKeyOfTimestamp,
  localDayKeyToDate,
} from "@/domain";

const ORIGINAL_TZ = process.env["TZ"];

function withTimeZone<T>(timeZone: string, run: () => T): T {
  process.env["TZ"] = timeZone;
  try {
    return run();
  } finally {
    if (ORIGINAL_TZ === undefined) delete process.env["TZ"];
    else process.env["TZ"] = ORIGINAL_TZ;
  }
}

describe("localDayKey", () => {
  it("devolve YYYY-MM-DD a partir dos componentes locais", () => {
    const date = new Date(2026, 0, 5, 8, 30, 0, 0);
    expect(localDayKey(date)).toBe("2026-01-05");
    expect(localDayKey(new Date(2026, 11, 31, 23, 0, 0, 0))).toBe("2026-12-31");
  });

  it("NÃO usa UTC: o dia local difere do dia UTC nas bordas", () => {
    // A oeste de UTC (UTC-3): 23:59 local já é o dia seguinte em UTC.
    withTimeZone("America/Sao_Paulo", () => {
      const lateNight = new Date(2026, 0, 15, 23, 59, 0, 0);
      expect(localDayKey(lateNight)).toBe("2026-01-15");
      expect(lateNight.toISOString().slice(0, 10)).toBe("2026-01-16");
    });

    // A leste de UTC (UTC+9): 00:05 local ainda é o dia anterior em UTC.
    withTimeZone("Asia/Tokyo", () => {
      const justAfterMidnight = new Date(2026, 0, 16, 0, 5, 0, 0);
      expect(localDayKey(justAfterMidnight)).toBe("2026-01-16");
      expect(justAfterMidnight.toISOString().slice(0, 10)).toBe("2026-01-15");
    });
  });

  it("rejeita data inválida", () => {
    expect(() => localDayKey(new Date("not-a-date"))).toThrow(TypeError);
  });

  it("localDayKeyOfTimestamp devolve null para instante inválido", () => {
    expect(localDayKeyOfTimestamp("2026-01-15T12:00:00.000Z")).toBe(
      localDayKey(new Date("2026-01-15T12:00:00.000Z")),
    );
    expect(localDayKeyOfTimestamp("15/01/2026")).toBeNull();
  });
});

describe("isLocalDayKey", () => {
  it("aceita dias reais, inclusive 29 de fevereiro em ano bissexto", () => {
    expect(isLocalDayKey("2026-01-15")).toBe(true);
    expect(isLocalDayKey("2024-02-29")).toBe(true);
  });

  it("recusa formato inválido, data inexistente e timestamp ISO", () => {
    expect(isLocalDayKey("2026-1-5")).toBe(false);
    expect(isLocalDayKey("2026-02-30")).toBe(false);
    expect(isLocalDayKey("2024-02-30")).toBe(false);
    expect(isLocalDayKey("2026-13-01")).toBe(false);
    expect(isLocalDayKey("2026-00-10")).toBe(false);
    expect(isLocalDayKey("2026-01-15T12:00:00.000Z")).toBe(false);
    expect(isLocalDayKey(20260115)).toBe(false);
  });
});

describe("aritmética de dias locais", () => {
  it("ancora no meio-dia local", () => {
    const date = localDayKeyToDate("2026-01-15");
    expect(date?.getHours()).toBe(12);
    expect(localDayKeyToDate("2026-02-30")).toBeNull();
  });

  it("atravessa o início do horário de verão sem perder o passo de 24 h", () => {
    withTimeZone("America/New_York", () => {
      // 08/03/2026 é o início do DST nos EUA (dia de 23 h).
      expect(addLocalDays("2026-03-07", 1)).toBe("2026-03-08");
      expect(addLocalDays("2026-03-08", 1)).toBe("2026-03-09");
      expect(addLocalDays("2026-03-09", -2)).toBe("2026-03-07");
      expect(diffLocalDays("2026-03-07", "2026-03-09")).toBe(2);
    });
  });

  it("soma através de virada de ano e valida entradas", () => {
    expect(addLocalDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addLocalDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(() => addLocalDays("2026-02-30", 1)).toThrow(TypeError);
    expect(() => addLocalDays("2026-01-01", 1.5)).toThrow(TypeError);
  });

  it("diffLocalDays é simétrico e compareLocalDayKeys ordena", () => {
    expect(diffLocalDays("2026-01-01", "2026-01-31")).toBe(30);
    expect(diffLocalDays("2026-01-31", "2026-01-01")).toBe(-30);
    expect(compareLocalDayKeys("2026-01-01", "2026-01-02")).toBe(-1);
    expect(compareLocalDayKeys("2026-01-02", "2026-01-02")).toBe(0);
    expect(compareLocalDayKeys("2026-01-03", "2026-01-02")).toBe(1);
  });
});
