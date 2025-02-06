import { config as baseReactConfig } from "@humandbs/eslint-config/react";
import eslintTanstackQuery from "@tanstack/eslint-plugin-query";
import eslintTanstackRouter from "@tanstack/eslint-plugin-router";
import eslintPrettier from "eslint-config-prettier";
export default config = [
  ...baseReactConfig,
  ...eslintTanstackRouter.configs["flat/recommended"],
  ...eslintTanstackQuery.configs["flat/recommended"],
  ...eslintPrettier,
];
