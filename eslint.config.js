import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
  {
    // Arquivos gerados pela plataforma (scaffold do Cloud). Não são editáveis
    // à mão e a formatação do projeto não se aplica a eles. Apenas a regra de
    // formatação é desligada aqui; todas as outras continuam valendo.
    files: ["src/integrations/supabase/**/*.{ts,tsx}"],
    rules: {
      "prettier/prettier": "off",
    },
  },
  {
    // Exceção pontual em arquivo gerado: o timer é lido pelo closure `finish`
    // antes de ser atribuído, então `prefer-const` reporta um falso positivo.
    // A regra continua ativa (error) e apenas o padrão de leitura anterior à
    // atribuição é ignorado neste arquivo.
    files: ["src/integrations/supabase/previewAuthStorage.ts"],
    rules: {
      "prefer-const": ["error", { ignoreReadBeforeAssign: true }],
    },
  },
);
