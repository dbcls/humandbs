import { baseConfig } from "@humandbs/eslint-config"
import stylistic from "@stylistic/eslint-plugin"
import { defineConfig } from "eslint/config"
import globals from "globals"

export default defineConfig([
  ...baseConfig,
  {
    files: [
      "apps/backend/**/*.{js,mjs,cjs,ts,tsx}",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@stylistic": stylistic,
    },
    rules: {
      // Stylistic
      "@stylistic/array-bracket-newline": ["error", "consistent"],
      "@stylistic/array-element-newline": ["error", "consistent"],
      "@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: true }],
      "@stylistic/comma-dangle": ["error", "always-multiline"],
      "@stylistic/eol-last": ["error", "always"],
      "@stylistic/indent": ["error", 2, { SwitchCase: 1 }],
      "@stylistic/no-multi-spaces": ["error"],
      "@stylistic/no-multiple-empty-lines": ["error", { max: 1 }],
      "@stylistic/no-trailing-spaces": ["error"],
      "@stylistic/object-curly-newline": ["error", { consistent: true }],
      "@stylistic/object-property-newline": ["error", { allowAllPropertiesOnSameLine: true }],
      "@stylistic/object-curly-spacing": ["error", "always"],
      "@stylistic/quotes": ["error", "double"],
      "@stylistic/semi": ["error", "never"],
      "@stylistic/member-delimiter-style": ["error", {
        multiline: { delimiter: "none", requireLast: false },
        singleline: { delimiter: "semi", requireLast: false },
      }],
    },
  },
])

