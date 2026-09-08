import { defineConfig, devices } from "@playwright/test"

import { SESSION_COOKIE } from "./app/auth/cookie"

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
const baseURL = process.env.HUMANDBS_E2E_BASE_URL ?? "http://proxy:8080"

/**
 * The session the signed-in scenarios carry.
 *
 * **A browser cannot sign in from out here.** The identity provider is a third
 * party with a login page of its own, and a scenario that drove it would be
 * testing that page rather than these screens — so the session is made on the
 * instance (`npm run e2e:session`) and handed over in the environment.
 *
 * Without it the cookie jar is empty, and the screens that need one answer with
 * a redirect to sign in: the scenarios say so and skip. **What they must not do
 * is pass** — which is why the cookie is the only thing this adds.
 */
export const SIGNED_IN = process.env.HUMANDBS_E2E_SESSION ?? ""

const address = new URL(baseURL)
const storageState = {
  cookies: SIGNED_IN === ""
    ? []
    : [{
        name: SESSION_COOKIE,
        value: SIGNED_IN,
        domain: address.hostname,
        path: "/",
        // A session ends by its row rather than by its cookie, so the jar keeps
        // this one for as long as the run lasts and the instance decides.
        expires: -1,
        httpOnly: true,
        secure: address.protocol === "https:",
        sameSite: "Lax" as const,
      }],
  origins: [],
}

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
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "anon",
      testMatch: /\.spec\.ts$/,
      testIgnore: /\.user\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], locale: "ja-JP" },
    },
    {
      name: "user",
      testMatch: /\.user\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], locale: "ja-JP", storageState },
    },
  ],
})
