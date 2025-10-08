import js from "@eslint/js"
import { defineConfig } from "eslint/config"
import eslintPluginImport from "eslint-plugin-import"
import tseslint from "typescript-eslint"

/**
 * A shared ESLint configuration for the repository.
 * Note: files, ignores, languageOptions are omitted here (should be defined in each project (i.e., frontend.mjs, backend.mjs)).
 * */
export default defineConfig([
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strict,
      ...tseslint.configs.stylistic,
      eslintPluginImport.flatConfigs.recommended,
      eslintPluginImport.flatConfigs.typescript,
    ],
    rules: {
      // TypeScript
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],

      // Import
      "import/first": "error",
      "import/order": ["error", {
        "newlines-between": "always",
        "groups": [["builtin", "external", "internal"], "parent", "sibling", "index"],
        "pathGroups": [{ pattern: "@/**", group: "internal", position: "after" }],
        "pathGroupsExcludedImportTypes": ["builtin"],
        "alphabetize": { order: "asc", caseInsensitive: true },
      }],
      "import/newline-after-import": "error",
      "import/no-duplicates": "error",
      "import/no-unresolved": "off",
      "import/named": "off",
      "import/default": "off",
      "import/namespace": "off",
    },
  },
])
