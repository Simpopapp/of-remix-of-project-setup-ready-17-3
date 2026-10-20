/**
 * Contrato do envelope de backup (`src/domain/backup.ts`).
 *
 * Regras provadas:
 * - v1 → v2 é migração ADITIVA: nada é perdido (nem campos desconhecidos),
 *   só se acrescenta `payload.aggregates: null`.
 * - Versão futura NUNCA migra: `reason: "future_version"` (quarentena é Fase 3).
 * - Envelope corrompido devolve `ok: false` com o caminho do campo — nunca
 *   lança, nunca conserta em silêncio.
 */

import { describe, expect, it } from "vitest";

import {
  BACKUP_FORMAT,
  CURRENT_BACKUP_VERSION,
  DomainValidationError,
  createEnvelope,
  inspectEnvelopeVersion,
  migrateEnvelope,
  parseEnvelope,
  type CurrentBackupEnvelope,
} from "@/domain";
import { LATER, NOW, validAttempt, validSnapshot } from "./fixtures";

function v1Envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    createdAt: NOW,
    device: "test-device",
    payload: {
      snapshots: [validSnapshot()],
      attemptsTail: [validAttempt()],
      settings: { goal: 65, examDate: "2026-06-01" },
    },
    ...overrides,
  };
}

describe("migrateEnvelope — v1 → v2 aditivo", () => {
  it("promove para a versão corrente acrescentando aggregates null", () => {
    const result = migrateEnvelope(v1Envelope());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.migratedFrom).toBe(1);
    expect(result.envelope.version).toBe(CURRENT_BACKUP_VERSION);
    expect(result.envelope.format).toBe(BACKUP_FORMAT);
    expect(result.envelope.createdAt).toBe(NOW);
    expect(result.envelope.device).toBe("test-device");

    // Nada existente é perdido.
    expect(result.envelope.payload.snapshots).toEqual([validSnapshot()]);
    expect(result.envelope.payload.attemptsTail).toEqual([validAttempt()]);
    expect(result.envelope.payload.settings).toEqual({ goal: 65, examDate: "2026-06-01" });
    // Só o campo novo é adicionado, com default seguro.
    expect(result.envelope.payload.aggregates).toBeNull();
  });

  it("preserva campos desconhecidos no envelope E no payload (nada é descartado)", () => {
    const legacy = v1Envelope({ legacyEnvelopeField: "keep-me" });
    (legacy["payload"] as Record<string, unknown>)["legacyPayloadField"] = { a: 1 };

    const result = migrateEnvelope(legacy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const migrated = result.envelope as unknown as Record<string, unknown>;
    expect(migrated["legacyEnvelopeField"]).toBe("keep-me");
    expect((migrated["payload"] as Record<string, unknown>)["legacyPayloadField"]).toEqual({
      a: 1,
    });
  });

  it("v2 já corrente não inventa nem perde nada", () => {
    const v2: Record<string, unknown> = {
      format: BACKUP_FORMAT,
      version: 2,
      createdAt: NOW,
      payload: {
        snapshots: [validSnapshot()],
        attemptsTail: [],
        settings: {},
        aggregates: null,
      },
    };
    const result = migrateEnvelope(v2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe(2);
    expect(result.envelope).toEqual(v2);
  });

  it("o log truncado (attemptsTail vazio) continua válido", () => {
    const envelope = v1Envelope();
    (envelope["payload"] as Record<string, unknown>)["attemptsTail"] = [];
    const result = migrateEnvelope(envelope);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.payload.attemptsTail).toEqual([]);
    expect(result.envelope.payload.snapshots).toHaveLength(1);
  });
});

describe("migrateEnvelope — recusas", () => {
  it("versão futura nunca é migrada", () => {
    const result = migrateEnvelope(v1Envelope({ version: CURRENT_BACKUP_VERSION + 1 }));
    expect(result).toMatchObject({
      ok: false,
      reason: "future_version",
      path: "envelope.version",
    });
  });

  it("inspectEnvelopeVersion sinaliza versão futura sem validar o payload", () => {
    expect(inspectEnvelopeVersion(v1Envelope({ version: 99, payload: "lixo" }))).toEqual({
      format: BACKUP_FORMAT,
      version: 99,
      future: true,
    });
    expect(inspectEnvelopeVersion(null)).toEqual({ format: null, version: null, future: false });
  });

  it("parseEnvelope lança future_version (quarentena é decisão da Fase 3)", () => {
    let caught: unknown;
    try {
      parseEnvelope(v1Envelope({ version: CURRENT_BACKUP_VERSION + 1 }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DomainValidationError);
    expect((caught as DomainValidationError).code).toBe("future_version");
    expect((caught as DomainValidationError).path).toBe("envelope.version");
  });

  it("recusa objeto ausente, formato errado, versão ausente e versão inválida", () => {
    expect(migrateEnvelope("texto")).toMatchObject({ ok: false, reason: "not_object" });
    expect(migrateEnvelope(v1Envelope({ format: "backup" }))).toMatchObject({
      ok: false,
      reason: "wrong_format",
      path: "envelope.format",
    });
    expect(migrateEnvelope({ format: BACKUP_FORMAT, payload: {} })).toMatchObject({
      ok: false,
      reason: "missing_version",
      path: "envelope.version",
    });
    expect(migrateEnvelope(v1Envelope({ version: "2" }))).toMatchObject({
      ok: false,
      reason: "invalid_version",
      path: "envelope.version",
    });
    expect(migrateEnvelope(v1Envelope({ version: 0 }))).toMatchObject({
      ok: false,
      reason: "invalid_version",
    });
  });

  it("payload corrompido devolve caminho exato, não lança", () => {
    const envelope = v1Envelope();
    (envelope["payload"] as Record<string, unknown>)["snapshots"] = [
      { ...validSnapshot(), srsBox: -1 },
    ];
    expect(migrateEnvelope(envelope)).toMatchObject({
      ok: false,
      reason: "corrupt_payload",
      path: "envelope.payload.snapshots[0].srsBox",
    });
  });

  it("snapshot duplicado no mesmo backup", () => {
    const envelope = v1Envelope();
    (envelope["payload"] as Record<string, unknown>)["snapshots"] = [
      validSnapshot(),
      validSnapshot(),
    ];
    expect(migrateEnvelope(envelope)).toMatchObject({
      ok: false,
      reason: "corrupt_payload",
      path: "envelope.payload.snapshots[1].questionId",
    });
  });

  it("tentativa com payload incompatível invalida o backup", () => {
    const envelope = v1Envelope();
    (envelope["payload"] as Record<string, unknown>)["attemptsTail"] = [
      { ...validAttempt(), payload: { kind: "choice", selected: [0] } },
    ];
    expect(migrateEnvelope(envelope)).toMatchObject({
      ok: false,
      reason: "corrupt_payload",
      path: "envelope.payload.attemptsTail[0].payload.kind",
    });
  });

  it("createdAt inválido é corrupção de payload", () => {
    expect(migrateEnvelope(v1Envelope({ createdAt: "ontem" }))).toMatchObject({
      ok: false,
      reason: "corrupt_payload",
      path: "envelope.createdAt",
    });
  });
});

describe("createEnvelope", () => {
  it("exporta sempre na versão corrente e revalida o resultado", () => {
    const envelope: CurrentBackupEnvelope = createEnvelope(
      {
        snapshots: [validSnapshot()],
        attemptsTail: [validAttempt()],
        settings: { goal: 79 },
      },
      { createdAt: NOW, device: "device-1" },
    );

    expect(envelope.version).toBe(CURRENT_BACKUP_VERSION);
    expect(envelope.device).toBe("device-1");
    expect(envelope.payload.aggregates).toBeNull();
    expect(parseEnvelope(envelope)).toEqual(envelope);
    expect(parseEnvelope(JSON.parse(JSON.stringify(envelope)))).toEqual(envelope);
  });

  it("recusa exportar snapshot inválido (nunca gera arquivo inválido)", () => {
    expect(() =>
      createEnvelope({
        snapshots: [{ ...validSnapshot(), srsBox: -3 }],
        attemptsTail: [],
        settings: {},
      }),
    ).toThrow(DomainValidationError);
  });

  it("aceita cauda de log truncada", () => {
    const envelope = createEnvelope(
      { snapshots: [], attemptsTail: [], settings: {}, aggregates: null },
      { createdAt: LATER },
    );
    expect(envelope.payload.attemptsTail).toEqual([]);
  });
});
