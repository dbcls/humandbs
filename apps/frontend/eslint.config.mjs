import { baseConfig } from "@humandbs/eslint-config";
import eslintTanstackQuery from "@tanstack/eslint-plugin-query";
import eslintTanstackRouter from "@tanstack/eslint-plugin-router";
import { defineConfig } from "eslint/config";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier/flat";

const FRONT_FILES = [
  "src/**/*.{js,mjs,cjs,ts,tsx}",
  "apps/frontend/src/**/*.{js,mjs,cjs,ts,tsx}",
];
const file_scope = (cfg) =>
  Array.isArray(cfg)
    ? cfg.map((c) => ({ ...c, files: FRONT_FILES }))
    : [{ ...cfg, files: FRONT_FILES }];

export default defineConfig([
  ...baseConfig,
  {
    files: FRONT_FILES,
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": pluginReactHooks,
      react: pluginReact,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      // React scope no longer necessary with new JSX transform.
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/only-throw-error": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
  ...file_scope(eslintTanstackRouter.configs["flat/recommended"]),
  ...file_scope(eslintTanstackQuery.configs["flat/recommended"]),
  ...file_scope(eslintConfigPrettier),
]);
