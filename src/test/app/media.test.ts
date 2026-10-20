import { describe, expect, it } from "vitest";
import { PROGRESS_STORES, ProgressTransactionError, type ProgressDatabase } from "@/lib/app/db";
import { MediaStore, browserQuotaEstimator, type QuotaEstimator } from "@/lib/app/media";
import { clockAt, makeDb } from "./helpers";

const NOW = "2026-01-10T12:00:00";

function bufferOf(...bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

function estimator(usage: number, quota: number): QuotaEstimator {
  return async () => ({
    usage,
    quota,
    available: Math.max(0, quota - usage),
    ratio: Math.min(1, usage / quota),
  });
}

describe("Mídia: persistência de gravações (F3.6)", () => {
  it("salva ArrayBuffer, lê de volta bytes idênticos e lista metadados", async () => {
    const harness = await makeDb("media");
    try {
      const store = new MediaStore({
        db: harness.db,
        now: clockAt(NOW),
        quotaEstimator: estimator(10, 10_000),
      });
      const result = await store.saveRecording({
        blob: bufferOf(1, 2, 3, 4),
        mimeType: "audio/webm",
        questionId: "q-1",
        attemptId: "a-1",
        durationMs: 1500,
      });
      if (!result.ok) throw new Error(result.message);
      expect(result.meta.byteSize).toBe(4);
      expect(result.meta.mimeType).toBe("audio/webm");
      expect(result.warning.level).toBe("ok");

      const list = await store.listRecordings();
      expect(list).toHaveLength(1);
      expect(list[0]?.questionId).toBe("q-1");
      expect(await store.totalBytes()).toBe(4);

      const full = await store.getRecording(result.meta.id);
      expect(full).not.toBeNull();
      expect([...new Uint8Array(full!.data)]).toEqual([1, 2, 3, 4]);

      const blob = await store.getRecordingBlob(result.meta.id);
      expect(blob?.type).toBe("audio/webm");
    } finally {
      await harness.close();
    }
  });

  it("filtra por questão e remove gravação explicitamente", async () => {
    const harness = await makeDb("media-list");
    try {
      const store = new MediaStore({
        db: harness.db,
        now: clockAt(NOW),
        quotaEstimator: estimator(0, 1000),
      });
      const a = await store.saveRecording({ blob: bufferOf(1), questionId: "q-a" });
      const b = await store.saveRecording({ blob: bufferOf(2), questionId: "q-b" });
      if (!a.ok || !b.ok) throw new Error("falha ao salvar");
      expect(await store.listRecordings("q-a")).toHaveLength(1);
      expect(await store.listRecordings("q-b")).toHaveLength(1);

      const removed = await store.deleteRecording(a.meta.id);
      expect(removed?.id).toBe(a.meta.id);
      expect(await store.listRecordings()).toHaveLength(1);
      expect(await store.deleteRecording("missing")).toBeNull();
    } finally {
      await harness.close();
    }
  });
});

describe("Mídia: aviso preventivo de quota", () => {
  it("80% de uso gera aviso warn, mas a gravação continua", async () => {
    const harness = await makeDb("media-warn");
    try {
      const store = new MediaStore({
        db: harness.db,
        now: clockAt(NOW),
        quotaEstimator: estimator(850, 1000),
      });
      const result = await store.saveRecording({ blob: bufferOf(1, 2, 3) });
      expect(result.ok).toBe(true);
      expect(result.warning.level).toBe("warn");
      expect(result.warning.message).toContain("ficando cheio");
    } finally {
      await harness.close();
    }
  });

  it("95%+ (ou espaço insuficiente) gera crítico, mas não bloqueia por estimativa", async () => {
    const harness = await makeDb("media-critical");
    try {
      const store = new MediaStore({
        db: harness.db,
        now: clockAt(NOW),
        quotaEstimator: estimator(999, 1000), // disponível 1 byte < 8
      });
      const result = await store.saveRecording({ blob: bufferOf(1, 2, 3, 4, 5, 6, 7, 8) });
      expect(result.ok).toBe(true);
      expect(result.warning.level).toBe("critical");
      expect(result.warning.requiredBytes).toBe(8);
    } finally {
      await harness.close();
    }
  });

  it("sem estimativa do navegador o nível é unknown (nunca finge saber)", async () => {
    const harness = await makeDb("media-unknown");
    try {
      const store = new MediaStore({
        db: harness.db,
        now: clockAt(NOW),
        quotaEstimator: async () => null,
      });
      const warning = await store.checkQuota(10);
      expect(warning.level).toBe("unknown");
      expect(warning.estimate).toBeNull();
      expect(warning.message).toBeTruthy();
    } finally {
      await harness.close();
    }
  });

  it("QuotaExceededError vira ok:false quota_exceeded (sem metadado órfão)", async () => {
    const failingDb = {
      transaction: async () => {
        throw new ProgressTransactionError(
          [PROGRESS_STORES.media],
          new DOMException("quota", "QuotaExceededError"),
        );
      },
    } as unknown as ProgressDatabase;
    const store = new MediaStore({
      db: failingDb,
      now: clockAt(NOW),
      quotaEstimator: estimator(10, 1000),
    });
    const result = await store.saveRecording({ blob: bufferOf(1, 2, 3) });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("deveria falhar");
    expect(result.error).toBe("quota_exceeded");
    expect(result.warning.level).toBe("critical");
  });

  it("buffer vazio não é salvo", async () => {
    const harness = await makeDb("media-empty");
    try {
      const store = new MediaStore({
        db: harness.db,
        now: clockAt(NOW),
        quotaEstimator: estimator(0, 1000),
      });
      const result = await store.saveRecording({ blob: new ArrayBuffer(0) });
      expect(result.ok).toBe(false);
      expect(await store.listRecordings()).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("estimador padrão degrada para null quando a API não existe", async () => {
    // jsdom não implementa navigator.storage.estimate
    await expect(browserQuotaEstimator()).resolves.toBeNull();
  });
});
