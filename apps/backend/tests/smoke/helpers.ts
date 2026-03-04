import { describe, it } from "bun:test"

const TIMEOUT = 30_000

// === Configuration ===

const envUrl = process.env.SMOKE_TEST_BASE_URL
if (!envUrl) {
  throw new Error("SMOKE_TEST_BASE_URL environment variable is required")
}

export const BASE_URL = envUrl.replace(/\/+$/, "")

export const url = (path: string) => `${BASE_URL}${path}`

// === Fetch helpers ===

interface JsonBody extends Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external HTTP response, deliberately loose
  data: any
  meta: Record<string, unknown> & { pagination: Record<string, unknown> }
}

interface FetchResult {
  status: number
  body: JsonBody
}

export const fetchJson = async (path: string, init?: RequestInit): Promise<FetchResult> => {
  const res = await fetch(url(path), {
    signal: AbortSignal.timeout(TIMEOUT),
    ...init,
  })
  const body = (await res.json()) as JsonBody

  return { status: res.status, body }
}

// === Assertion helpers ===

export const expectBaseMeta = (meta: Record<string, unknown>) => {
  if (typeof meta.requestId !== "string" || meta.requestId === "") {
    throw new Error(`Expected non-empty requestId, got: ${JSON.stringify(meta.requestId)}`)
  }
  if (typeof meta.timestamp !== "string" || meta.timestamp === "") {
    throw new Error(`Expected non-empty timestamp, got: ${JSON.stringify(meta.timestamp)}`)
  }
}

export const expectPagination = (pagination: Record<string, unknown>) => {
  if (typeof pagination.page !== "number") {
    throw new Error(`Expected pagination.page to be number, got: ${typeof pagination.page}`)
  }
  if (typeof pagination.limit !== "number") {
    throw new Error(`Expected pagination.limit to be number, got: ${typeof pagination.limit}`)
  }
  if (typeof pagination.total !== "number") {
    throw new Error(`Expected pagination.total to be number, got: ${typeof pagination.total}`)
  }
  if (typeof pagination.totalPages !== "number") {
    throw new Error(`Expected pagination.totalPages to be number, got: ${typeof pagination.totalPages}`)
  }
}

// === Error response helpers ===

/**
 * RFC 7807 Problem Details response (AppError: 404, 401, 403, 409, 500)
 */
export const expectProblemDetails = (body: Record<string, unknown>, expectedStatus: number) => {
  if (typeof body.type !== "string" || body.type === "") {
    throw new Error(`Expected non-empty type, got: ${JSON.stringify(body.type)}`)
  }
  if (typeof body.title !== "string" || body.title === "") {
    throw new Error(`Expected non-empty title, got: ${JSON.stringify(body.title)}`)
  }
  if (body.status !== expectedStatus) {
    throw new Error(`Expected status ${expectedStatus}, got: ${JSON.stringify(body.status)}`)
  }
  if (typeof body.timestamp !== "string" || body.timestamp === "") {
    throw new Error(`Expected non-empty timestamp, got: ${JSON.stringify(body.timestamp)}`)
  }
}

/**
 * Zod validation error response (OpenAPIHono default hook: 400)
 */
export const expectValidationError = (body: Record<string, unknown>) => {
  if (body.success !== false) {
    throw new Error(`Expected success=false, got: ${JSON.stringify(body.success)}`)
  }
  const error = body.error as Record<string, unknown> | undefined
  if (!error || typeof error !== "object") {
    throw new Error(`Expected error object, got: ${JSON.stringify(error)}`)
  }
}

// === Shared setup (runs once, cached) ===

interface SmokeState {
  reachable: boolean
  humId: string
  datasetId: string
}

let setupPromise: Promise<SmokeState> | undefined

const runSetup = async (): Promise<SmokeState> => {
  const state: SmokeState = { reachable: false, humId: "", datasetId: "" }

  try {
    const res = await fetch(url("/health"), { signal: AbortSignal.timeout(10_000) })
    state.reachable = res.ok
  } catch {
    // unreachable
  }
  console.log(`Smoke target: ${BASE_URL}`)
  console.log(`Server reachable: ${state.reachable}`)

  if (!state.reachable) {
    return state
  }

  try {
    const { body } = await fetchJson("/research?page=1&limit=1")
    const items = body.data as Record<string, unknown>[] | undefined
    const first = items?.[0]
    if (typeof first?.humId === "string") {
      state.humId = first.humId
    }
  } catch {
    // ok
  }
  console.log(`Sample humId: ${state.humId || "(none)"}`)

  try {
    const { body } = await fetchJson("/dataset?page=1&limit=1")
    const items = body.data as Record<string, unknown>[] | undefined
    const first = items?.[0]
    if (typeof first?.datasetId === "string") {
      state.datasetId = first.datasetId
    }
  } catch {
    // ok
  }
  console.log(`Sample datasetId: ${state.datasetId || "(none)"}`)

  return state
}

const getState = (): Promise<SmokeState> => {
  setupPromise ??= runSetup()

  return setupPromise
}

// === Conditional skip helpers ===

export const itLive = (name: string, fn: () => Promise<void>) => {
  it(name, async () => {
    const s = await getState()
    if (!s.reachable) {
      console.log(`  SKIP (server unreachable): ${name}`)

      return
    }
    await fn()
  }, TIMEOUT)
}

export const itWithResearch = (name: string, fn: (humId: string) => Promise<void>) => {
  it(name, async () => {
    const s = await getState()
    if (!s.reachable) {
      console.log(`  SKIP (server unreachable): ${name}`)

      return
    }
    if (!s.humId) {
      console.log(`  SKIP (no sample humId): ${name}`)

      return
    }
    await fn(s.humId)
  }, TIMEOUT)
}

export const itWithDataset = (name: string, fn: (datasetId: string) => Promise<void>) => {
  it(name, async () => {
    const s = await getState()
    if (!s.reachable) {
      console.log(`  SKIP (server unreachable): ${name}`)

      return
    }
    if (!s.datasetId) {
      console.log(`  SKIP (no sample datasetId): ${name}`)

      return
    }
    await fn(s.datasetId)
  }, TIMEOUT)
}

// Re-export describe for convenience
export { describe }
