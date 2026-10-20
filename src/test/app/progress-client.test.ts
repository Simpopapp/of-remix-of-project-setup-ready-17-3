/**
 * Testes do singleton de progresso (F4.0.1).
 *
 * Contratos provados:
 * 1. Uma única abertura para todo o app (a Promise é a mesma).
 * 2. `isProgressAvailable()` é `false` quando não há IndexedDB injetado.
 * 3. Sem IndexedDB a abertura rejeita com `ProgressDbUnavailableError`
 *    (a UI trata como estado degradado, não como crash).
 * 4. Falha de abertura NÃO envenena o singleton: a próxima chamada tenta de novo.
 * 5. `peekProgressLayer()` só devolve algo depois de uma abertura bem-sucedida.
 */

import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";

import { deleteProgressDb, ProgressDbUnavailableError } from "@/lib/app/db";
import {
  closeProgressLayer,
  configureProgressClient,
  getProgressLayer,
  isProgressAvailable,
  peekProgressLayer,
  resetProgressClient,
} from "@/lib/app/progress-client";

const created: Array<{ name: string; factory: IDBFactory }> = [];

function makeName(label: string): string {
  const name = `pte-progress-client-${label}-${created.length + 1}`;
  return name;
}

afterEach(async () => {
  await closeProgressLayer();
  resetProgressClient();
  for (const entry of created.splice(0)) {
    await deleteProgressDb({ name: entry.name, indexedDB: entry.factory });
  }
});

describe("progress-client — singleton (F4.0.1)", () => {
  it("devolve a mesma Promise para todos os chamadores", async () => {
    const factory = new IDBFactory();
    const name = makeName("singleton");
    created.push({ name, factory });
    configureProgressClient({ dbName: name, indexedDB: factory });

    expect(isProgressAvailable()).toBe(true);
    expect(peekProgressLayer()).toBeNull();

    const first = getProgressLayer();
    const second = getProgressLayer();
    expect(second).toBe(first);

    const layer = await first;
    expect(layer.store).toBeDefined();
    expect(layer.backup).toBeDefined();
    expect(peekProgressLayer()).toBe(layer);
    expect(getProgressLayer()).toBe(first);
  });

  it("depois de fechar, a próxima chamada abre uma conexão nova", async () => {
    const factory = new IDBFactory();
    const name = makeName("reopen");
    created.push({ name, factory });
    configureProgressClient({ dbName: name, indexedDB: factory });

    const first = getProgressLayer();
    await first;
    await closeProgressLayer();
    expect(peekProgressLayer()).toBeNull();

    const second = getProgressLayer();
    expect(second).not.toBe(first);
    await expect(second).resolves.toBeDefined();
  });
});

describe("progress-client — indisponibilidade (degradação honesta)", () => {
  it("sem IndexedDB injetado, `isProgressAvailable()` é false", () => {
    configureProgressClient({ indexedDB: null });
    expect(isProgressAvailable()).toBe(false);
  });

  it("sem IndexedDB, a abertura rejeita com erro claro (nunca pendura)", async () => {
    configureProgressClient({ indexedDB: null });
    await expect(getProgressLayer()).rejects.toBeInstanceOf(ProgressDbUnavailableError);
    // A rejeição não deixa a Promise presa: chamar de novo rejeita igual.
    await expect(getProgressLayer()).rejects.toBeInstanceOf(ProgressDbUnavailableError);
  });
});

describe("progress-client — falha não envenena o singleton", () => {
  it("uma fábrica que lança na abertura rejeita e permite nova tentativa", async () => {
    const brokenFactory = {
      open: () => {
        throw new Error("falha simulada na abertura");
      },
    } as unknown as IDBFactory;
    configureProgressClient({ dbName: makeName("broken"), indexedDB: brokenFactory });

    expect(isProgressAvailable()).toBe(true);
    const first = getProgressLayer();
    await expect(first).rejects.toBeInstanceOf(ProgressDbUnavailableError);
    expect(peekProgressLayer()).toBeNull();

    const second = getProgressLayer();
    expect(second).not.toBe(first);
    await expect(second).rejects.toBeInstanceOf(ProgressDbUnavailableError);
  });
});
