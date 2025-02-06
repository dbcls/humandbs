import { config as baseConfig } from "./base.mjs";
import stylisticJs from "@stylistic/eslint-plugin-js";

/**
 * A shared ESLint configuration with stylistic fixable rules.
 *
 * @type {import("eslint").Linter.Config}
 * */
export const config = [
  ...baseConfig,
  {
    plugins: {
      "@stylistic/js": stylisticJs,
    },

    rules: {
      // Stylistic rules
      "@stylistic/js/array-bracket-newline": ["error", "consistent"],
      "@stylistic/js/array-bracket-spacing": ["error", "never"],
      "@stylistic/js/array-element-newline": ["error", "consistent"],
      "@stylistic/js/brace-style": ["error", "1tbs", { allowSingleLine: true }],
      "@stylistic/js/comma-dangle": ["error", "always-multiline"],
      "@stylistic/js/eol-last": ["error", "always"],
      "@stylistic/js/indent": ["error", 2],

      "@stylistic/js/no-multi-spaces": ["error"],
      "@stylistic/js/no-multiple-empty-lines": ["error", { max: 1 }],
      "@stylistic/js/no-trailing-spaces": ["error"],
      "@stylistic/js/object-curly-newline": ["error", { consistent: true }],
      "@stylistic/js/object-property-newline": [
        "error",
        { allowAllPropertiesOnSameLine: true },
      ],
      "@stylistic/js/object-curly-spacing": ["error", "always"],
      "@stylistic/js/quotes": ["error", "double"],
      "@stylistic/js/semi": ["error", "never"],
    },
  },
];
