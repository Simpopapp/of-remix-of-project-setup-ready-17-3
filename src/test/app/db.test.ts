import { describe, expect, it } from "vitest";
import {
  PROGRESS_STORES,
  PROGRESS_STORE_NAMES,
  ProgressDbClosedError,
  ProgressDbUnavailableError,
  ProgressTransactionError,
  deleteProgressDb,
  getStore,
  isProgressDbAvailable,
  openProgressDb,
  requestResult,
  tryOpenProgressDb,
} from "@/lib/app/db";
import { makeDb, makeSnapshot } from "./helpers";

describe("ProgressDatabase (F3.1)", () => {
  it("cria todos os object stores e índices exigidos pela Fase 3", async () => {
    const harness = await makeDb("schema");
    try {
      for (const name of PROGRESS_STORE_NAMES) {
        expect(harness.db.objectStoreNames.contains(name)).toBe(true);
      }
      const indexes = await harness.db.read(PROGRESS_STORES.attempts, (store) => {
        return {
          byQuestionId: store.indexNames.contains("byQuestionId"),
        };
      });
      expect(indexes.byQuestionId).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it("resolve a transação somente depois do commit (dado legível após await)", async () => {
    const harness = await makeDb("commit");
    try {
      const snapshot = makeSnapshot();
      await harness.db.transaction([PROGRESS_STORES.snapshots], "readwrite", async (tx) => {
        await requestResult(getStore(tx, PROGRESS_STORES.snapshots).put(snapshot));
      });
      const stored = await harness.db.read(PROGRESS_STORES.snapshots, async (store) => {
        return (await requestResult(store.get(snapshot.questionId))) as unknown;
      });
      expect(stored).toMatchObject({ questionId: snapshot.questionId, attempts: 1 });
    } finally {
      await harness.close();
    }
  });

  it("aborta tudo quando o callback lança (nada de estado parcial)", async () => {
    const harness = await makeDb("abort");
    try {
      await expect(
        harness.db.transaction([PROGRESS_STORES.snapshots], "readwrite", async (tx) => {
          await requestResult(getStore(tx, PROGRESS_STORES.snapshots).put(makeSnapshot()));
          throw new Error("falha simulada no meio da escrita");
        }),
      ).rejects.toThrow("falha simulada no meio da escrita");

      const count = await harness.db.read(PROGRESS_STORES.snapshots, (store) =>
        requestResult(store.count()),
      );
      expect(count).toBe(0);
    } finally {
      await harness.close();
    }
  });

  it("aborta a transação quando um request falha (chave duplicada)", async () => {
    const harness = await makeDb("request-failure");
    try {
      const snapshot = makeSnapshot();
      await expect(
        harness.db.transaction([PROGRESS_STORES.snapshots], "readwrite", async (tx) => {
          const store = getStore(tx, PROGRESS_STORES.snapshots);
          await requestResult(store.add(snapshot));
          await requestResult(store.add(snapshot));
        }),
      ).rejects.toBeInstanceOf(ProgressTransactionError);

      const count = await harness.db.read(PROGRESS_STORES.snapshots, (store) =>
        requestResult(store.count()),
      );
      expect(count).toBe(0);
    } finally {
      await harness.close();
    }
  });

  it("persiste através de reload (fechar e reabrir o mesmo banco)", async () => {
    const harness = await makeDb("reload");
    try {
      await harness.db.transaction([PROGRESS_STORES.meta], "readwrite", async (tx) => {
        await requestResult(
          getStore(tx, PROGRESS_STORES.meta).put({ key: "settings", value: { goal: 65 } }),
        );
      });
      const reopened = await harness.reopen();
      const value = await reopened.read(PROGRESS_STORES.meta, async (store) => {
        const row = (await requestResult(store.get("settings"))) as { value: unknown } | undefined;
        return row?.value;
      });
      expect(value).toEqual({ goal: 65 });
    } finally {
      await harness.close();
    }
  });

  it("degradação: sem IndexedDB não abre e não cria estado falso", async () => {
    expect(isProgressDbAvailable(null)).toBe(false);
    await expect(openProgressDb({ indexedDB: null })).rejects.toBeInstanceOf(
      ProgressDbUnavailableError,
    );
    await expect(tryOpenProgressDb({ indexedDB: null })).resolves.toBeNull();
    await expect(deleteProgressDb({ indexedDB: null })).resolves.toBeUndefined();
  });

  it("recusa operações depois de close()", async () => {
    const harness = await makeDb("closed");
    try {
      harness.db.close();
      expect(harness.db.isClosed).toBe(true);
      await expect(
        harness.db.transaction([PROGRESS_STORES.meta], "readonly", () => undefined),
      ).rejects.toBeInstanceOf(ProgressDbClosedError);
    } finally {
      await harness.close();
    }
  });
});
