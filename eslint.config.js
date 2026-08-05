import js from "@eslint/js"
import stylistic from "@stylistic/eslint-plugin"
import { defineConfig, globalIgnores } from "eslint/config"
import reactHooks from "eslint-plugin-react-hooks"
import tseslint from "typescript-eslint"

export default defineConfig([
  globalIgnores(["build/", ".react-router/", "node_modules/", ".claude/"]),
  {
    files: ["**/*.{js,ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      stylistic.configs.customize({
        indent: 2,
        quotes: "double",
        semi: false,
        jsx: true,
        braceStyle: "1tbs",
        arrowParens: true,
      }),
    ],
    languageOptions: {
      parserOptions: {
        // eslint.config.js is JavaScript and therefore outside tsconfig's include.
        projectService: { allowDefaultProject: ["eslint.config.js"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
      "@typescript-eslint/restrict-template-expressions": ["error", {
        allowNumber: true,
      }],
    },
  },
  {
    files: ["app/**/*.tsx"],
    extends: [reactHooks.configs.flat.recommended],
  },
])
