import { defineConfig, devices } from "@playwright/test"

import { SESSION_COOKIE } from "./app/auth/cookie"

/**
 * The end-to-end tests, which drive a browser against a running instance.
 *
 * **What is being driven is a deployment, not this source.** Nothing here
 * builds or starts the application: the address comes from the environment, so
 * the same scenarios run against the compose in this repo and against staging
 * without being written twice.
 *
 * **The two projects are the two kinds of reader.** A file named `.user.spec.ts`
 * needs somebody signed in and has the stored session; everything else is
 * the anonymous reader, and runs with no session at all so that a page which
 * only works while signed in cannot pass by accident. Before the signed-in ones,
 * `leftovers.setup.ts` takes out what a failed run made and left behind.
 */
const baseURL = process.env.HUMANDBS_E2E_BASE_URL ?? "http://localhost:8080"

/**
 * The session the signed-in scenarios have.
 *
 * **A browser cannot sign in from out here.** The identity provider is a third
 * party with a login page of its own, and a scenario that drove it would be
 * testing that page rather than these screens — so the session is made on the
 * instance (`npm run e2e:session`) and handed over in the environment.
 *
 * Without it the cookie jar is empty, and the screens that need one respond with
 * a redirect to sign in: the scenarios report it and skip. **What they must not do
 * is pass** — which is why the cookie is the only thing this adds.
 */
export const SIGNED_IN = process.env.HUMANDBS_E2E_SESSION ?? ""

/**
 * What the instance is meant to be, which the scenarios cannot read off it.
 *
 * **An instance that was deployed wrongly looks the same as one that was
 * deployed as meant** — production kept out of search engines responds exactly
 * as staging does — so the one running the scenarios passes in which it is,
 * and the scenarios that need it skip when nobody did.
 */
export const EXPECTED = {
  /** `true` or `false`: the instance's `HUMANDBS_NOINDEX`. */
  noindex: process.env.HUMANDBS_E2E_NOINDEX ?? "",
  /** The tag the instance was deployed at, as `/healthz` gives it. */
  version: process.env.HUMANDBS_E2E_VERSION ?? "",
}

/**
 * A session of somebody signed in who is not an administrator
 * (`npm run e2e:session -- non-admin`), for what the management area shows
 * them. The scenario that needs it skips without it.
 */
export const NON_ADMIN = process.env.HUMANDBS_E2E_NON_ADMIN_SESSION ?? ""

const address = new URL(baseURL)

/** A cookie jar holding the session `value`, or nothing when it is empty. */
export function sessionState(value: string) {
  return {
    cookies: value === ""
      ? []
      : [{
          name: SESSION_COOKIE,
          value,
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
}

const storageState = sessionState(SIGNED_IN)

export default defineConfig({
  testDir: "tests/e2e",
  // The instance holds one set of published rows, and a scenario that publishes
  // would change what another is reading.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  // **What is being driven may be across a network.** The default of five
  // seconds is a local figure; a deployment responding to a search takes longer
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
      name: "leftovers",
      testMatch: /leftovers\.setup\.ts$/,
      use: { ...devices["Desktop Chrome"], locale: "ja-JP", storageState },
    },
    {
      name: "user",
      testMatch: /\.user\.spec\.ts$/,
      dependencies: ["leftovers"],
      use: { ...devices["Desktop Chrome"], locale: "ja-JP", storageState },
    },
  ],
})
