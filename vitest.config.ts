import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "migration/**/*.test.ts"],
    // Tests that touch the database share one, and each empties it before
    // every case, so two files running at once would clear each other's rows.
    fileParallelism: false,
  },
})
