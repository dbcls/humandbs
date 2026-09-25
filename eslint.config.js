import js from "@eslint/js"
import stylistic from "@stylistic/eslint-plugin"
import { defineConfig, globalIgnores } from "eslint/config"
import reactHooks from "eslint-plugin-react-hooks"
import tseslint from "typescript-eslint"

export default defineConfig([
  // `test-results/` is what a failed e2e run leaves behind — traces and their
  // copies of the sources. They come and go while a run is in flight, so
  // linting them fails on a file that was there when the list was taken.
  globalIgnores([
    "build/",
    ".react-router/",
    "node_modules/",
    "public/swagger-ui/",
    ".claude/",
    "assistant-api/",
    "test-results/",
  ]),
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
      // A loader responds with a `Response`: a redirect and a 404 are thrown so
      // that the code after them is unreachable by construction.
      "@typescript-eslint/only-throw-error": ["error", {
        allow: [{ from: "lib", name: "Response" }],
      }],
    },
  },
  {
    files: ["app/**/*.tsx"],
    extends: [reactHooks.configs.flat.recommended],
  },
])
