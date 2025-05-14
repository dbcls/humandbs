import js from "@eslint/js"
import stylistic from "@stylistic/eslint-plugin"
import eslintTanstackQuery from "@tanstack/eslint-plugin-query"
import eslintTanstackRouter from "@tanstack/eslint-plugin-router"
import eslintPluginImport from "eslint-plugin-import"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import globals from "globals"
import tseslint, { configs as tsLintConfigs } from "typescript-eslint"

export default tseslint.config([{
  extends: [
    js.configs.recommended,
    ...tsLintConfigs.strict,
    ...tsLintConfigs.stylistic,
    eslintPluginImport.flatConfigs.recommended,
    eslintPluginImport.flatConfigs.typescript,
    ...eslintTanstackRouter.configs["flat/recommended"],
    ...eslintTanstackQuery.configs["flat/recommended"],

  ],
  files: ["**/*.{js,ts,tsx}"],
  ignores: ["dist"],
  languageOptions: { ecmaVersion: 2020, globals: globals.browser },
  plugins: {
    "react-hooks": reactHooks,
    "react-refresh": reactRefresh,
    "@stylistic": stylistic,
  },

  rules: {
    ...reactHooks.configs.recommended.rules,
    "react-refresh/only-export-components": [
      "warn",
      {
        allowConstantExport: true,
      },
    ],

    // Our rules
    "@typescript-eslint/no-non-null-assertion": "off",

    // Stylistic rules
    "@stylistic/array-bracket-newline": ["error", "consistent"],
    "@stylistic/array-bracket-spacing": ["error", "never"],
    "@stylistic/array-element-newline": ["error", "consistent"],
    "@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: true }],
    "@stylistic/comma-dangle": ["error", "always-multiline"],
    "@stylistic/eol-last": ["error", "always"],
    "@stylistic/indent": ["error", 2],
    "@stylistic/jsx-quotes": ["error", "prefer-double"],
    "@stylistic/no-multi-spaces": ["error"],
    "@stylistic/no-multiple-empty-lines": ["error", { max: 1 }],
    "@stylistic/no-trailing-spaces": ["error"],
    "@stylistic/object-curly-newline": ["error", { consistent: true }],
    "@stylistic/object-property-newline": [
      "error",
      { allowAllPropertiesOnSameLine: true },
    ],
    "@stylistic/object-curly-spacing": ["error", "always"],
    "@stylistic/quotes": ["error", "double"],
    "@stylistic/semi": ["error", "never"],
    "@stylistic/member-delimiter-style": [
      "error",
      {
        multiline: {
          delimiter: "none",
          requireLast: false,
        },
        singleline: {
          delimiter: "semi",
          requireLast: false,
        },
      },
    ],

    // Import rules
    "import/first": "error",
    "import/order": [
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
    "import/newline-after-import": "error",
    "import/no-duplicates": "error",
    "import/no-unresolved": "off",
  },
}])
