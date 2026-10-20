/**
 * Pureza dos módulos de domínio e integridade do barrel.
 *
 * Critério de aceite do pacote: `src/domain/**` é lógica pura — sem React, sem
 * TanStack, sem rede, sem storage, sem builtins de Node. Isso é o que permite
 * usá-los no importador (Fase 2), no storage (Fase 3) e no harness (Fase 5) sem
 * arrastar dependências de UI/runtime.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as domain from "@/domain";

const DOMAIN_DIR = join(process.cwd(), "src", "domain");

const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: "react", pattern: /from\s+["']react(?:-dom)?["']/ },
  { label: "@tanstack", pattern: /@tanstack\// },
  { label: "rede", pattern: /\bfetch\s*\(|XMLHttpRequest|WebSocket/ },
  { label: "storage", pattern: /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/ },
  { label: "builtin node", pattern: /from\s+["']node:/ },
  { label: "require", pattern: /\brequire\s*\(/ },
  { label: "import dinâmico", pattern: /\bimport\s*\(/ },
];

const files = readdirSync(DOMAIN_DIR).filter((name) => name.endsWith(".ts"));

describe("src/domain é puro", () => {
  it("tem os módulos esperados", () => {
    expect(files.sort()).toEqual(
      [
        "aggregates.ts",
        "attempt.ts",
        "backup.ts",
        "day.ts",
        "evaluation.ts",
        "index.ts",
        "question.ts",
        "schema.ts",
        "snapshot.ts",
      ].sort(),
    );
  });

  it.each(files)("%s não importa UI, rede, storage nem builtins", (file) => {
    const source = readFileSync(join(DOMAIN_DIR, file), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const rule of FORBIDDEN) {
      expect(rule.pattern.test(code), `${file}: viola a regra "${rule.label}"`).toBe(false);
    }
  });

  it("cada módulo exporta algo (nenhum arquivo morto)", () => {
    for (const file of files) {
      const source = readFileSync(join(DOMAIN_DIR, file), "utf8");
      expect(/\bexport\b/.test(source), `${file} não exporta nada`).toBe(true);
    }
  });
});

describe("barrel @/domain", () => {
  it("expõe os contratos e validadores das fases seguintes", () => {
    const requiredFunctions = [
      "parseQuestion",
      "parseQuestions",
      "parseQuestionData",
      "parseAttempt",
      "parseAttemptPayload",
      "parseSnapshot",
      "parseAggregates",
      "parseEvaluationResult",
      "parseEnvelope",
      "parseBackupPayload",
      "migrateEnvelope",
      "createEnvelope",
      "localDayKey",
      "localDayKeyOfTimestamp",
      "addLocalDays",
      "diffLocalDays",
      "emptySnapshot",
      "emptyAggregates",
    ] as const;

    for (const name of requiredFunctions) {
      expect(typeof (domain as Record<string, unknown>)[name], name).toBe("function");
    }

    expect(domain.TASK_TYPES).toHaveLength(22);
    expect(domain.BACKUP_FORMAT).toBe("pte-master-hub-backup");
    expect(domain.CURRENT_BACKUP_VERSION).toBeGreaterThanOrEqual(2);
  });
});
