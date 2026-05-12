/**
 * Integration test setup module.
 *
 * Each `<category>.test.ts` calls `beforeAll(setupIntegration)` to populate
 * shared connection state, staging Keycloak tokens, and runtime ES fixtures.
 * State lives in module scope so subsequent files reuse the result inside the
 * same `bun test` process (idempotent guard via `setupDone`).
 *
 * Operational notes: `tests/integration-note.md`. Scenario SSOT: `tests/integration-scenarios.md`.
 */
import { it } from "bun:test"

import { createApp } from "@/api/app"
import { jgaSql } from "@/api/db-client/client"
import { esClient, ES_INDEX } from "@/api/es-client"
import type { SearchResponse } from "@/api/types"

// === Environment ===

const ISSUER_URL = process.env.HUMANDBS_AUTH_ISSUER_URL ?? ""
const CLIENT_ID = process.env.HUMANDBS_AUTH_CLIENT_ID ?? ""
const STAGING_USERNAME = process.env.HUMANDBS_STAGING_USERNAME ?? ""
const STAGING_PASSWORD = process.env.HUMANDBS_STAGING_PASSWORD ?? ""
const STAGING_ADMIN_USERNAME = process.env.HUMANDBS_STAGING_ADMIN_USERNAME ?? ""
const STAGING_ADMIN_PASSWORD = process.env.HUMANDBS_STAGING_ADMIN_PASSWORD ?? ""
const URL_PREFIX = process.env.HUMANDBS_BACKEND_URL_PREFIX ?? ""

// Isolation-index activation marker: every override must point at a `-it` index
// AND the indices must actually exist (otherwise mutating IT would silently fall
// through to the production indices and clobber real data).
const ISOLATION_INDEX_NAMES = {
  research: process.env.HUMANDBS_ES_INDEX_RESEARCH ?? "",
  researchVersion: process.env.HUMANDBS_ES_INDEX_RESEARCH_VERSION ?? "",
  dataset: process.env.HUMANDBS_ES_INDEX_DATASET ?? "",
}

// === Module-scope state populated by setupIntegration() ===

let setupDone = false
let esConnected = false
let jgaConnected = false
let adminToken: string | null = null
let nonAdminToken: string | null = null
let isolationIndexReady = false

export interface IntegrationFixtures {
  /** A representative published `humId` from the live ES (latestVersion!=null, status=published). */
  publishedHumId: string
  /** A representative `datasetId` whose parent Research is publicly visible. */
  publishedDatasetId: string
  /** A `humId` whose research-version index has >=2 versions, for version-resolution scenarios. */
  multiVersionHumId: string
}

let fixtures: IntegrationFixtures = {
  publishedHumId: "",
  publishedDatasetId: "",
  multiVersionHumId: "",
}

// === Public helpers ===

/** Build a request path honoring `HUMANDBS_BACKEND_URL_PREFIX`. */
export const url = (path: string): string => `${URL_PREFIX}${path}`

/** Build an Authorization header object. */
export const authHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
})

/**
 * Build a Hono app instance for the running env.
 *
 * Unlike `tests/unit/api/helpers/test-app.ts § getTestApp`, this does NOT strip
 * `HUMANDBS_BACKEND_URL_PREFIX`. The integration env is expected to carry the
 * same prefix the production container uses (the compose default is `/api`).
 */
export const getApp = (): ReturnType<typeof createApp> => createApp()

export const isEsConnected = (): boolean => esConnected
export const isJgaConnected = (): boolean => jgaConnected
export const isIsolationIndexReady = (): boolean => isolationIndexReady
export const getAdminToken = (): string | null => adminToken
export const getNonAdminToken = (): string | null => nonAdminToken
export const getFixtures = (): IntegrationFixtures => fixtures
export const getUrlPrefix = (): string => URL_PREFIX
export const getIsolationIndexNames = (): typeof ISOLATION_INDEX_NAMES => ISOLATION_INDEX_NAMES

/**
 * Extract the `sub` (user id) claim from a JWT without verifying its signature.
 * Used in tests to assert that owner-only data comes back keyed to the calling user.
 */
export const decodeJwtSub = (token: string): string | null => {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const json = JSON.parse(atob(padded)) as { sub?: unknown }
    return typeof json.sub === "string" ? json.sub : null
  } catch {
    return null
  }
}

// === Conditional `it` runners ===

const skipLog = (name: string, reason: string): void => {
  console.log(`  SKIP ${name}: ${reason}`)
}

/** Run `fn` if ES is reachable; otherwise log a skip line and pass the test. */
export const itWithEs = (name: string, fn: () => Promise<void>): void => {
  it(name, async () => {
    if (!esConnected) {
      skipLog(name, "ES not connected")
      return
    }
    await fn()
  })
}

/** Run `fn` if the JGA PostgreSQL is reachable. */
export const itWithJga = (name: string, fn: () => Promise<void>): void => {
  it(name, async () => {
    if (!jgaConnected) {
      skipLog(name, "JGA DB not connected")
      return
    }
    await fn()
  })
}

/**
 * Run `fn` if the JGA PostgreSQL is reachable AND a staging admin token is available.
 * Required for `/jga-shinsei/*` endpoints which combine adminOnly with a live DB query.
 *
 * Live PostgreSQL aggregations on staging routinely exceed bun:test's 5s default
 * (the listing CTE can take 30s+). We extend the per-test timeout to 60s; chasing the
 * underlying query performance is tracked separately.
 */
export const itWithJgaAdmin = (
  name: string,
  fn: (token: string) => Promise<void>,
): void => {
  it(name, async () => {
    if (!jgaConnected) {
      skipLog(name, "JGA DB not connected")
      return
    }
    if (!adminToken) {
      skipLog(name, "staging admin token unavailable")
      return
    }
    await fn(adminToken)
  }, 60_000)
}

/** Run `fn` with the staging admin token if available (ES is also required). */
export const itWithAdminToken = (
  name: string,
  fn: (token: string) => Promise<void>,
): void => {
  it(name, async () => {
    if (!esConnected) {
      skipLog(name, "ES not connected")
      return
    }
    if (!adminToken) {
      skipLog(name, "staging admin token unavailable")
      return
    }
    await fn(adminToken)
  })
}

/** Run `fn` with the staging non-admin token if available. */
export const itWithNonAdminToken = (
  name: string,
  fn: (token: string) => Promise<void>,
): void => {
  it(name, async () => {
    if (!esConnected) {
      skipLog(name, "ES not connected")
      return
    }
    if (!nonAdminToken) {
      skipLog(name, "staging non-admin token unavailable")
      return
    }
    await fn(nonAdminToken)
  })
}

/**
 * Run `fn` only when the isolated `*-it` indices are bootstrapped and reachable.
 *
 * Mutating IT (create / update / delete) must NEVER write into the production
 * indices. This helper short-circuits to a skip log when:
 *   - `HUMANDBS_ES_INDEX_RESEARCH` / `..._RESEARCH_VERSION` / `..._DATASET` are
 *     not all set, or
 *   - any of them does not end with `-it` (defence in depth against typos), or
 *   - any of the three indices is missing on the ES cluster.
 *
 * Bootstrap with `apps/backend/scripts/bootstrap-it-index.ts` first.
 * Both `adminToken` and `nonAdminToken` are passed for tests that need to
 * exercise multiple roles within the same case.
 */
export const itWithIsolationIndex = (
  name: string,
  fn: (tokens: { admin: string; nonAdmin: string }) => Promise<void>,
): void => {
  it(name, async () => {
    if (!esConnected) {
      skipLog(name, "ES not connected")
      return
    }
    if (!isolationIndexReady) {
      skipLog(name, "isolation index not bootstrapped (HUMANDBS_ES_INDEX_*)")
      return
    }
    if (!adminToken || !nonAdminToken) {
      skipLog(name, "staging tokens unavailable")
      return
    }
    await fn({ admin: adminToken, nonAdmin: nonAdminToken })
  })
}

/** Inside an `itWithEs` body, gate further execution on a probed fixture. */
export const requireFixture = (
  testName: string,
  value: string,
  fixtureName: keyof IntegrationFixtures,
): string | null => {
  if (!value) {
    skipLog(testName, `fixture "${fixtureName}" is empty`)
    return null
  }
  return value
}

// === Internal: staging Keycloak token fetch ===

const fetchStagingToken = async (
  username: string,
  password: string,
): Promise<string | null> => {
  if (!ISSUER_URL || !CLIENT_ID || !username || !password) return null
  const tokenUrl = `${ISSUER_URL.replace(/\/$/, "")}/protocol/openid-connect/token`
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: CLIENT_ID,
    username,
    password,
    scope: "openid",
  })
  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { access_token?: unknown }
    return typeof json.access_token === "string" ? json.access_token : null
  } catch {
    return null
  }
}

// === Internal: runtime fixture probe ===

interface ResearchListItem {
  humId: string
  versionIds?: string[]
}

interface DatasetListItem {
  datasetId: string
}

const probeFixtures = async (): Promise<IntegrationFixtures> => {
  const probed: IntegrationFixtures = {
    publishedHumId: "",
    publishedDatasetId: "",
    multiVersionHumId: "",
  }
  if (!esConnected) return probed

  const app = getApp()

  try {
    const res = await app.request(url("/research?limit=50"))
    if (res.status === 200) {
      const json = (await res.json()) as SearchResponse<ResearchListItem>
      if (json.data.length > 0) probed.publishedHumId = json.data[0].humId
      const multi = json.data.find((r) => (r.versionIds?.length ?? 0) >= 2)
      if (multi) probed.multiVersionHumId = multi.humId
    }
  } catch (err) {
    console.log(`  fixture probe (research): ${(err as Error).message}`)
  }

  try {
    const res = await app.request(url("/dataset?limit=1"))
    if (res.status === 200) {
      const json = (await res.json()) as SearchResponse<DatasetListItem>
      if (json.data.length > 0) probed.publishedDatasetId = json.data[0].datasetId
    }
  } catch (err) {
    console.log(`  fixture probe (dataset): ${(err as Error).message}`)
  }

  return probed
}

// === Public setup entry point ===

/**
 * Idempotent setup invoked from each test file's `beforeAll`.
 *
 * Safe to call multiple times: the first call probes external services,
 * subsequent calls return immediately so the per-file `beforeAll` overhead
 * stays bounded.
 */
export const setupIntegration = async (): Promise<void> => {
  if (setupDone) return
  setupDone = true

  try {
    const health = await esClient.cluster.health({ timeout: "5s" })
    esConnected = health.status === "green" || health.status === "yellow"
    console.log(`ES connection: ${esConnected ? "OK" : `degraded (${health.status})`}`)
  } catch (err) {
    esConnected = false
    console.log(`ES connection: FAILED (${(err as Error).message})`)
  }

  try {
    await jgaSql`SELECT 1`
    jgaConnected = true
    console.log("JGA DB connection: OK")
  } catch (err) {
    jgaConnected = false
    console.log(`JGA DB connection: FAILED (${(err as Error).message})`)
  }

  adminToken = await fetchStagingToken(STAGING_ADMIN_USERNAME, STAGING_ADMIN_PASSWORD)
  nonAdminToken = await fetchStagingToken(STAGING_USERNAME, STAGING_PASSWORD)

  // Probe the isolation indices. We require all three to be present AND for
  // every override to carry the `-it` suffix; absent either condition we keep
  // `isolationIndexReady = false` so mutating IT remain skipped (defence in
  // depth: ES_INDEX would otherwise resolve to the production indices).
  const isolationNames = [
    ISOLATION_INDEX_NAMES.research,
    ISOLATION_INDEX_NAMES.researchVersion,
    ISOLATION_INDEX_NAMES.dataset,
  ]
  const allOverridesSet = isolationNames.every((n) => !!n)
  const allLookSafe = isolationNames.every((n) => n.endsWith("-it"))
  if (esConnected && allOverridesSet && allLookSafe) {
    try {
      const checks = await Promise.all(
        isolationNames.map((index) => esClient.indices.exists({ index })),
      )
      if (checks.every(Boolean)) {
        isolationIndexReady = true
      } else {
        console.log(
          `Isolation indices missing on ES (${isolationNames.filter((_, i) => !checks[i]).join(", ")}); mutating IT will skip.`,
        )
      }
    } catch (err) {
      console.log(`Isolation index probe failed: ${(err as Error).message}`)
    }
  }
  console.log(
    `Isolation index: ${isolationIndexReady ? `ready (${ES_INDEX.research}/${ES_INDEX.researchVersion}/${ES_INDEX.dataset})` : "skip"}`,
  )

  // Guard against "fake non-admin" tokens: if `HUMANDBS_STAGING_USERNAME` happens to be in
  // `admin_uids.json`, the resulting token is actually admin and would silently bypass
  // ownership/adminOnly guards in mutating tests (see `.claude/docs/staging-integration-test.md`).
  // Drop the token in that case so `itWithNonAdminToken` falls back to skip rather than mutate
  // shared ES with admin privileges.
  if (esConnected && nonAdminToken) {
    try {
      const app = createApp()
      const res = await app.request(`${URL_PREFIX}/admin/is-admin`, {
        headers: { Authorization: `Bearer ${nonAdminToken}` },
      })
      if (res.status === 200) {
        const json = (await res.json()) as { data?: { isAdmin?: boolean } }
        if (json.data?.isAdmin === true) {
          console.log(
            "Staging Keycloak: configured non-admin user is in admin_uids.json — dropping nonAdminToken to avoid mutating shared ES",
          )
          nonAdminToken = null
        }
      }
    } catch (err) {
      console.log(`  non-admin token guard failed (treating as unavailable): ${(err as Error).message}`)
      nonAdminToken = null
    }
  }

  console.log(
    `Staging Keycloak: admin=${adminToken ? "OK" : "skip"}, non-admin=${nonAdminToken ? "OK" : "skip"}`,
  )

  fixtures = await probeFixtures()
  console.log(`Fixtures: ${JSON.stringify(fixtures)}`)
  console.log(`URL prefix: "${URL_PREFIX}"`)
}
