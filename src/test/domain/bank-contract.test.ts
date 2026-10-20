import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SECTION_BY_TYPE,
  TASK_TYPES,
  parseQuestions,
  type Provenance,
  type Question,
  type TaskType,
} from "@/domain";

/**
 * Verificação do contrato contra o banco REAL (2.823 itens).
 *
 * Desde a Fase 2 o banco vive versionado no repositório (`src/data/bank/`), então
 * este teste roda sempre: prova que todo item aprovado passa em `parseQuestion` e
 * que as contagens batem com o `MANIFEST.json` do pacote.
 */

const BANK_DIR = join(process.cwd(), "src", "data", "bank");
const QUESTIONS_DIR = join(BANK_DIR, "questions");
const MANIFEST_PATH = join(BANK_DIR, "MANIFEST.json");
const bankAvailable = existsSync(QUESTIONS_DIR) && existsSync(MANIFEST_PATH);

interface ManifestShape {
  totalQuestoes: number;
  contagemPorTipo: Record<string, number>;
  proveniencia: Record<Provenance, number>;
}

// Banco versionado desde a Fase 2: ausência é falha, nunca auto-skip silencioso.
if (!bankAvailable) {
  throw new Error(`Banco versionado ausente em ${BANK_DIR} (esperado questions/ + MANIFEST.json).`);
}

describe("contrato × banco real", () => {
  it("aceita todos os itens dos 22 tipos e reproduz as contagens do manifesto", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as ManifestShape;
    const files = readdirSync(QUESTIONS_DIR)
      .filter((file) => file.endsWith(".json"))
      .sort();

    expect(files).toHaveLength(22);

    const byType: Partial<Record<TaskType, number>> = {};
    const byProvenance: Record<string, number> = {};
    const allQuestions: Question[] = [];

    for (const file of files) {
      const type = file.replace(/\.json$/, "") as TaskType;
      expect(TASK_TYPES).toContain(type);
      const raw: unknown = JSON.parse(readFileSync(join(QUESTIONS_DIR, file), "utf8"));
      const questions = parseQuestions(raw, `questions[${type}]`);
      expect(questions.every((question) => question.section === SECTION_BY_TYPE[type])).toBe(true);
      byType[type] = questions.length;
      for (const question of questions) {
        byProvenance[question.provenance] = (byProvenance[question.provenance] ?? 0) + 1;
      }
      allQuestions.push(...questions);
    }

    expect(allQuestions.length).toBe(manifest.totalQuestoes);
    expect(byType).toEqual(manifest.contagemPorTipo);
    expect(byProvenance).toEqual(manifest.proveniencia);
    // Sem duplicatas de id no banco inteiro:
    expect(new Set(allQuestions.map((question) => question.id)).size).toBe(allQuestions.length);
  });

  it("describe_image sempre tem licença e imagem apontando para /di/", () => {
    const raw = JSON.parse(
      readFileSync(join(QUESTIONS_DIR, "describe_image.json"), "utf8"),
    ) as unknown;
    const questions = parseQuestions(raw, "questions[describe_image]");
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      if (question.type !== "describe_image") throw new Error("tipo inesperado");
      expect(question.source.license).toBeTruthy();
      expect(question.data.image.startsWith("/di/")).toBe(true);
    }
  });
});
