import js from "@eslint/js"
import { defineConfig } from "eslint/config"
import eslintPluginImport from "eslint-plugin-import"
import tseslint from "typescript-eslint"

/**
 * A shared ESLint configuration for the repository.
 * Note: languageOptions.parserOptions.project should be defined in each project.
 */
export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      eslintPluginImport.flatConfigs.recommended,
      eslintPluginImport.flatConfigs.typescript,
    ],
    rules: {
      // TypeScript
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-unnecessary-type-parameters": "off",
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
