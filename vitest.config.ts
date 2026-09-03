import { defaultExclude, defineConfig } from "vitest/config"

/**
 * The projects split on what a test needs in order to run, not on what it is
 * about: `unit` is everything that runs from source alone, `db` is everything
 * that needs `docker compose up`. Which layer a file belongs to is written in
 * its name (see docs/testing.md).
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          // Components are tested by rendering them to a string, so the unit
          // project picks up `.tsx` as well.
          include: ["app/**/*.test.{ts,tsx}", "migration/**/*.test.ts"],
          exclude: [...defaultExclude, "**/*.db.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["app/**/*.db.test.ts", "migration/**/*.db.test.ts"],
          // Points the connections at the test database and refuses to go on if
          // they landed anywhere else (docs/testing.md).
          setupFiles: ["./vitest.db-setup.ts"],
          // These share one database and each empties it before every case, so
          // two files running at once would clear each other's rows.
          fileParallelism: false,
        },
      },
    ],
  },
})
