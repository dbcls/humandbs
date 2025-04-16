import js from "@eslint/js";
import eslintPluginImportX from "eslint-plugin-import-x";
import globals from "globals";
import tseslint, { configs as tsLintConfigs } from "typescript-eslint";

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config}
 * */
export const config = tseslint.config([
  {
    extends: [
      js.configs.recommended,
      ...tsLintConfigs.strict,
      ...tsLintConfigs.stylistic,
      eslintPluginImportX.flatConfigs.recommended,
      eslintPluginImportX.flatConfigs.typescript,
    ],
    files: ["**/*.{js,ts,tsx}"],
    ignores: ["dist"],
    languageOptions: { ecmaVersion: 2020, globals: globals.browser },

    rules: {
      // Our rules
      "@typescript-eslint/no-non-null-assertion": "off",

      // Import rules
      "import-x/first": "error",
      "import-x/order": [
        "error",
        {
          "newlines-between": "always",
          groups: [
            ["builtin", "external", "internal"],
            "parent",
            "sibling",
            "index",
          ],
          pathGroups: [
            {
              pattern: "@/**",
              group: "internal",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "import-x/newline-after-import": "error",
      "import-x/no-duplicates": "error",
      "import-x/no-unresolved": "off",
    },
  },
]);
