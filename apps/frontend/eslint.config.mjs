import { baseConfig } from "@humandbs/eslint-config";
import eslintTanstackQuery from "@tanstack/eslint-plugin-query";
import eslintTanstackRouter from "@tanstack/eslint-plugin-router";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

const FRONT_FILES = ["apps/frontend/**/*.{js,mjs,cjs,ts,tsx}"];
const file_scope = (cfg) =>
  Array.isArray(cfg)
    ? cfg.map(c => ({ ...c, files: FRONT_FILES }))
    : [{ ...cfg, files: FRONT_FILES }];

export default defineConfig([
  // ...baseConfig,
  // {
  //   files: FRONT_FILES,
  //   languageOptions: {
  //     ...pluginReact.configs.flat.recommended.languageOptions,
  //     globals: {
  //       ...globals.browser,
  //       ...globals.serviceworker,
  //     },
  //   },
  //   plugins: {
  //     "react-hooks": pluginReactHooks,
  //     react: pluginReact,
  //   },
  //   settings: {
  //     react: {
  //       version: "detect",
  //     },
  //   },
  //   rules: {
  //     ...pluginReactHooks.configs.recommended.rules,
  //     // React scope no longer necessary with new JSX transform.
  //     "react/react-in-jsx-scope": "off",
  //   },
  // },
  // ...file_scope(eslintTanstackRouter.configs["flat/recommended"]),
  // ...file_scope(eslintTanstackQuery.configs["flat/recommended"]),
  // // ...file_scope(eslintConfigPrettier),
]);
