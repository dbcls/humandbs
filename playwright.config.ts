import { defineConfig, devices } from "@playwright/test"

/**
 * The end-to-end tests, which drive a browser against a running instance.
 *
 * **What is being driven is a deployment, not this source.** Nothing here
 * builds or starts the application: the address comes from the environment, so
 * the same scenarios run against the compose in this repo and against staging
 * without being written twice (`docs/testing.md`).
 *
 * **The two projects are the two kinds of reader.** A file named `.user.spec.ts`
 * needs somebody signed in and carries the stored session; everything else is
 * the anonymous reader, and runs with no session at all so that a page which
 * only works while signed in cannot pass by accident.
 */
export default defineConfig({
  testDir: "tests/e2e",
  // The instance holds one set of published rows, and a scenario that publishes
  // would change what another is reading.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  // **What is being driven may be across a network.** The default of five
  // seconds is a local figure; a deployment answering a search takes longer
  // than that often enough to fail a scenario that is not broken.
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: process.env.HUMANDBS_E2E_BASE_URL ?? "http://proxy:8080",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "anon",
      testMatch: /\.spec\.ts$/,
      testIgnore: /\.user\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], locale: "ja-JP" },
    },
  ],
})
