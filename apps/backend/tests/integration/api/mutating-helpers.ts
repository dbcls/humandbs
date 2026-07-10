/**
 * Mutating helpers for integration tests.
 *
 * These wrap the `POST /research/new` /
 * `POST /research/{humId}/{submit,approve,reject,unpublish}` /
 * `POST /research/{humId}/dataset/new` / `POST /research/{humId}/versions/new` /
 * `POST /research/{humId}/delete` paths so each IT can describe its scenario
 * as `arrange → act → assert → cleanup` without re-implementing the
 * boilerplate. All helpers carry `seqNo` / `primaryTerm` in the return value
 * so the caller can chain optimistic-lock-aware actions without an extra GET.
 *
 * Ownership assignment (`setOwnerUids`) does not hit an API endpoint; it seeds
 * the in-process ownership cache in `services/ownership.ts` — production
 * ownership is read-only from the JGA DB and cannot be mutated by tests.
 *
 * Constraints (see plan): the production indices must never be touched.
 * Callers must already be inside `itWithIsolationIndex`, which verifies that
 * the `-it` indices are wired in. The helpers themselves do not re-check —
 * that is the responsibility of the `itWithIsolationIndex` wrapper.
 *
 * `purgeResearch` is the cleanup primitive: it is idempotent (accepts
 * `[204, 404]`) and never throws, so a `try/finally` can rely on it even when
 * the test body raised mid-scenario.
 */
import { expect } from "bun:test"

import { seedOwnershipForTest } from "@/api/services/ownership"

import { authHeaders, getApp, url } from "./setup"

export interface ResearchHandle {
  humId: string
  seqNo: number
  primaryTerm: number
  status?: string
  latestVersion?: string | null
  draftVersion?: string | null
  dateModified?: string
  datePublished?: string | null
}

export interface DatasetHandle {
  datasetId: string
  humId: string
  version: string
  seqNo: number
  primaryTerm: number
  releaseDate?: string
  criteria?: string
  experiments?: unknown[]
}

interface SingleEnvelope<T> {
  data: T
  meta: {
    _seq_no?: number
    _primary_term?: number
  }
}

const asString = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback

const asStringOrNull = (v: unknown): string | null | undefined =>
  v === null ? null : typeof v === "string" ? v : undefined

/**
 * Pull the optimistic-lock pair out of a response envelope. ES `_seq_no` is
 * 0-based and `_primary_term` is 1-based, so silently defaulting either to
 * `0`/`1` on missing meta would yield optimistic-lock false positives
 * (the next PUT would appear to "lock against the right doc" when in fact
 * the response shape was malformed). We throw instead so the test fails fast
 * with a pointer to the actual problem.
 */
const requireSeqLock = (
  meta: { _seq_no?: number; _primary_term?: number },
  source: string,
): { seqNo: number; primaryTerm: number } => {
  const seqNo = meta._seq_no
  const primaryTerm = meta._primary_term
  if (typeof seqNo !== "number" || typeof primaryTerm !== "number") {
    throw new Error(
      `${source}: response meta is missing optimistic-lock fields ` +
      `(_seq_no=${String(seqNo)}, _primary_term=${String(primaryTerm)}). ` +
      "Mutating helpers depend on the API returning both as numbers.",
    )
  }
  return { seqNo, primaryTerm }
}

const extractHandle = (json: SingleEnvelope<Record<string, unknown>>): ResearchHandle => {
  const data = json.data
  const { seqNo, primaryTerm } = requireSeqLock(json.meta, "extractHandle")
  const handle: ResearchHandle = {
    humId: asString(data.humId),
    seqNo,
    primaryTerm,
  }
  if (typeof data.status === "string") handle.status = data.status
  const latest = asStringOrNull(data.latestVersion)
  if (latest !== undefined) handle.latestVersion = latest
  const draft = asStringOrNull(data.draftVersion)
  if (draft !== undefined) handle.draftVersion = draft
  if (typeof data.dateModified === "string") handle.dateModified = data.dateModified
  const datePublished = asStringOrNull(data.datePublished)
  if (datePublished !== undefined) handle.datePublished = datePublished
  return handle
}

const extractDatasetHandle = (
  json: SingleEnvelope<Record<string, unknown>>,
): DatasetHandle => {
  const data = json.data
  const { seqNo, primaryTerm } = requireSeqLock(json.meta, "extractDatasetHandle")
  return {
    datasetId: asString(data.datasetId),
    humId: asString(data.humId),
    version: asString(data.version, "v1"),
    seqNo,
    primaryTerm,
    releaseDate: typeof data.releaseDate === "string" ? data.releaseDate : undefined,
    criteria: typeof data.criteria === "string" ? data.criteria : undefined,
    experiments: Array.isArray(data.experiments) ? data.experiments : undefined,
  }
}

const randomHumId = (): string =>
  `hum${9000 + Math.floor(Math.random() * 999)}`

/**
 * Create a fresh draft Research as admin.
 *
 * Calls `POST /research/new` and asserts 201. The returned handle carries the
 * `humId`, the initial `_seq_no` / `_primary_term`, and the default
 * value-based fields (`status:"draft"`, `latestVersion:null`,
 * `draftVersion:"v1"`).
 *
 * When `opts.humId` is omitted a random 5-digit humId is generated so tests
 * that don't care about the specific id don't have to supply one.
 */
export const createDraftResearch = async (
  admin: string,
  opts: { humId?: string } = {},
): Promise<ResearchHandle> => {
  const app = getApp()
  const humId = opts.humId ?? randomHumId()
  const res = await app.request(url("/research/new"), {
    method: "POST",
    headers: { ...authHeaders(admin), "Content-Type": "application/json" },
    body: JSON.stringify({ humId }),
  })
  expect(res.status).toBe(201)
  const json = (await res.json()) as SingleEnvelope<Record<string, unknown>>
  return extractHandle(json)
}

/**
 * Get the latest `_seq_no` / `_primary_term` for a Research without mutating it.
 * Used when an IT body needs to construct an optimistic-lock payload after
 * an intermediate write that didn't return through one of the helpers.
 */
export const getResearchSeqNo = async (
  token: string,
  humId: string,
): Promise<{ seqNo: number; primaryTerm: number }> => {
  const app = getApp()
  const res = await app.request(url(`/research/${humId}`), { headers: authHeaders(token) })
  expect(res.status).toBe(200)
  const json = (await res.json()) as SingleEnvelope<Record<string, unknown>>
  return requireSeqLock(json.meta, `getResearchSeqNo(${humId})`)
}

/**
 * Grant the given Keycloak `preferred_username`s ownership over `humId` for
 * the current test process. Production ownership is derived from JGA DB
 * `nbdc_application` rows; integration tests cannot insert into that shared
 * DB, so we seed the in-process ownership cache (`services/ownership.ts`)
 * directly. The seed is visible to any request served by the same `bun test`
 * process — which includes `app.request(...)` in the same file.
 *
 * The helper's name and shape are preserved so existing IT bodies keep
 * working; the payload just switched from `sub` (JWT `sub`) to the caller's
 * `preferred_username` — see `decodeJwtPreferredUsername` in `setup.ts`.
 */
export const setOwnerUids = async (
  admin: string,
  humId: string,
  usernames: string[],
): Promise<ResearchHandle> => {
  seedOwnershipForTest(usernames.map(username => ({ humId, username })))
  const current = await getResearchSeqNo(admin, humId)
  return {
    humId,
    seqNo: current.seqNo,
    primaryTerm: current.primaryTerm,
  }
}

interface WorkflowResponse {
  data: { humId: string; status: string; dateModified?: string }
  meta: { _seq_no?: number; _primary_term?: number }
}

const callWorkflow = async (
  token: string,
  humId: string,
  action: "submit" | "approve" | "reject" | "unpublish",
): Promise<ResearchHandle> => {
  const app = getApp()
  const res = await app.request(url(`/research/${humId}/${action}`), {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: "{}",
  })
  expect(res.status).toBe(200)
  const json = (await res.json()) as WorkflowResponse
  const { seqNo, primaryTerm } = requireSeqLock(json.meta, `${action}(${humId})`)
  return {
    humId,
    seqNo,
    primaryTerm,
    status: json.data.status,
    dateModified: json.data.dateModified,
  }
}

export const submitForReview = (ownerToken: string, humId: string): Promise<ResearchHandle> =>
  callWorkflow(ownerToken, humId, "submit")

export const approveResearch = (admin: string, humId: string): Promise<ResearchHandle> =>
  callWorkflow(admin, humId, "approve")

export const rejectResearch = (admin: string, humId: string): Promise<ResearchHandle> =>
  callWorkflow(admin, humId, "reject")

export const unpublishResearch = (admin: string, humId: string): Promise<ResearchHandle> =>
  callWorkflow(admin, humId, "unpublish")

/**
 * Create a Dataset for a draft Research (owner or admin). Asserts 201 and
 * returns the new dataset's `datasetId`, `version`, and lock fields.
 */
export const createDatasetForResearch = async (
  ownerOrAdmin: string,
  humId: string,
): Promise<DatasetHandle> => {
  const app = getApp()
  const res = await app.request(url(`/research/${humId}/dataset/new`), {
    method: "POST",
    headers: { ...authHeaders(ownerOrAdmin), "Content-Type": "application/json" },
    body: "{}",
  })
  expect(res.status).toBe(201)
  const json = (await res.json()) as SingleEnvelope<Record<string, unknown>>
  return extractDatasetHandle(json)
}

/**
 * Create a new draft version for a published Research (owner). Asserts 201
 * and returns the new draft version (`draftVersion`).
 */
export const createNewVersion = async (
  ownerToken: string,
  humId: string,
): Promise<ResearchHandle> => {
  const app = getApp()
  const res = await app.request(url(`/research/${humId}/versions/new`), {
    method: "POST",
    headers: { ...authHeaders(ownerToken), "Content-Type": "application/json" },
    body: "{}",
  })
  expect(res.status).toBe(201)
  const json = (await res.json()) as SingleEnvelope<Record<string, unknown>>
  const { seqNo, primaryTerm } = requireSeqLock(json.meta, `createNewVersion(${humId})`)
  return {
    humId,
    seqNo,
    primaryTerm,
    draftVersion: typeof json.data.version === "string" ? json.data.version : undefined,
  }
}

/**
 * Cleanup primitive: delete a Research (admin only). Idempotent and
 * never throws, so callers can place it in a `finally` without masking the
 * test assertion that failed earlier.
 *
 * Accepts both 204 (deleted) and 404 (already gone). Other statuses are
 * logged via `console.warn` so a failed cleanup does not abort the test run.
 */
export const purgeResearch = async (admin: string, humId: string): Promise<void> => {
  if (!humId) return
  const app = getApp()
  try {
    const res = await app.request(url(`/research/${humId}/delete`), {
      method: "POST",
      headers: authHeaders(admin),
    })
    if (res.status !== 204 && res.status !== 404) {
      console.warn(`  purgeResearch(${humId}): unexpected status ${res.status}`)
    }
  } catch (err) {
    console.warn(`  purgeResearch(${humId}): ${(err as Error).message}`)
  }
}
