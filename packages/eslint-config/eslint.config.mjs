import { defineConfig } from "eslint/config"

import { default as baseConfig } from "./base.mjs"

/**
 * ESLint config for linting the eslint-config package itself (i.e., this package).
 */
export default defineConfig([
  {
    files: ["./*.mjs"],
  },
  ...baseConfig,
])
