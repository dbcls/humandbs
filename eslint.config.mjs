import backendConfig from "./apps/backend/eslint.config.mjs"
import frontendConfig from "./apps/frontend/eslint.config.mjs"

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
    ],
  },
  ...backendConfig,
  ...frontendConfig,
]
