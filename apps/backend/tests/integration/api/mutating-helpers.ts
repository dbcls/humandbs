/**
 * Mutating helpers for integration tests.
 *
 * These wrap the `POST /research/new` / `PUT /research/{humId}/uids` /
 * `POST /research/{humId}/{submit,approve,reject,unpublish}` /
 * `POST /research/{humId}/dataset/new` / `POST /research/{humId}/versions/new` /
 * `POST /research/{humId}/delete` paths so each IT can describe its scenario
 * as `arrange → act → assert → cleanup` without re-implementing the
 * boilerplate. All helpers carry `seqNo` / `primaryTerm` in the return value
 * so the caller can chain optimistic-lock-aware actions without an extra GET.
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

const extractHandle = (json: SingleEnvelope<Record<string, unknown>>): ResearchHandle => {
  const data = json.data
  const handle: ResearchHandle = {
    humId: asString(data.humId),
    seqNo: typeof json.meta._seq_no === "number" ? json.meta._seq_no : 0,
    primaryTerm: typeof json.meta._primary_term === "number" ? json.meta._primary_term : 1,
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
  return {
    datasetId: asString(data.datasetId),
    humId: asString(data.humId),
    version: asString(data.version, "v1"),
    seqNo: typeof json.meta._seq_no === "number" ? json.meta._seq_no : 0,
    primaryTerm: typeof json.meta._primary_term === "number" ? json.meta._primary_term : 1,
    releaseDate: typeof data.releaseDate === "string" ? data.releaseDate : undefined,
    criteria: typeof data.criteria === "string" ? data.criteria : undefined,
    experiments: Array.isArray(data.experiments) ? data.experiments : undefined,
  }
}

/**
 * Create a fresh draft Research as admin.
 *
 * Calls `POST /research/new` and asserts 201. The returned handle carries the
 * auto-allocated `humId`, the initial `_seq_no` / `_primary_term`, and the
 * default value-based fields (`status:"draft"`, `latestVersion:null`,
 * `draftVersion:"v1"`).
 */
export const createDraftResearch = async (
  admin: string,
  opts: { humId?: string } = {},
): Promise<ResearchHandle> => {
  const app = getApp()
  const body: Record<string, unknown> = {}
  if (opts.humId !== undefined) body.humId = opts.humId
  const res = await app.request(url("/research/new"), {
    method: "POST",
    headers: { ...authHeaders(admin), "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
  return {
    seqNo: typeof json.meta._seq_no === "number" ? json.meta._seq_no : 0,
    primaryTerm: typeof json.meta._primary_term === "number" ? json.meta._primary_term : 1,
  }
}

/**
 * Replace the `uids` list of a Research (admin-only). After the write succeeds,
 * we re-GET to verify the new uids are visible in the search index (defends
 * against the eventual-consistency window so subsequent owner-token actions
 * see themselves in `uids`).
 */
export const setOwnerUids = async (
  admin: string,
  humId: string,
  uids: string[],
): Promise<ResearchHandle> => {
  const app = getApp()
  const current = await getResearchSeqNo(admin, humId)
  const res = await app.request(url(`/research/${humId}/uids`), {
    method: "PUT",
    headers: { ...authHeaders(admin), "Content-Type": "application/json" },
    body: JSON.stringify({
      uids,
      _seq_no: current.seqNo,
      _primary_term: current.primaryTerm,
    }),
  })
  expect(res.status).toBe(200)
  const json = (await res.json()) as SingleEnvelope<Record<string, unknown>>

  // Re-GET to confirm the uids landed (search refresh / get refresh window).
  const verify = await app.request(url(`/research/${humId}`), { headers: authHeaders(admin) })
  const verifyJson = (await verify.json()) as SingleEnvelope<{ uids?: string[] }>
  const observed = verifyJson.data.uids ?? []
  for (const uid of uids) expect(observed).toContain(uid)

  return {
    humId,
    seqNo: typeof verifyJson.meta._seq_no === "number" ? verifyJson.meta._seq_no : json.meta._seq_no ?? 0,
    primaryTerm: typeof verifyJson.meta._primary_term === "number" ? verifyJson.meta._primary_term : json.meta._primary_term ?? 1,
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
  return {
    humId,
    seqNo: typeof json.meta._seq_no === "number" ? json.meta._seq_no : 0,
    primaryTerm: typeof json.meta._primary_term === "number" ? json.meta._primary_term : 1,
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
  return {
    humId,
    seqNo: typeof json.meta._seq_no === "number" ? json.meta._seq_no : 0,
    primaryTerm: typeof json.meta._primary_term === "number" ? json.meta._primary_term : 1,
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
