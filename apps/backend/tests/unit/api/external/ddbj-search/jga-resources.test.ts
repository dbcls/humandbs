import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { DdbjSearchApiError } from "@/api/external/ddbj-search/client"
import {
  fetchJgaParentStudyId,
  parentStudyCache,
} from "@/api/external/ddbj-search/jga-resources"

const originalFetch = globalThis.fetch

interface StubOptions {
  status?: number
  body?: unknown
  bodyText?: string
  throwError?: Error
}

let capturedRequests: { url: string; headers: Record<string, string> }[] = []

function stubFetch(options: StubOptions | ((url: string) => StubOptions)): void {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input)
    const headers: Record<string, string> = {}
    if (init?.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        headers[k] = v
      }
    }
    capturedRequests.push({ url, headers })

    const opts = typeof options === "function" ? options(url) : options
    if (opts.throwError) throw opts.throwError

    const status = opts.status ?? 200
    if (opts.bodyText !== undefined) {
      return new Response(opts.bodyText, { status })
    }
    return new Response(JSON.stringify(opts.body ?? {}), {
      status,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch
}

describe("fetchJgaParentStudyId", () => {
  beforeEach(() => {
    parentStudyCache.clear()
    capturedRequests = []
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("returns the first jga-study identifier from dbXrefs", async () => {
    stubFetch({
      body: {
        found: true,
        _source: {
          dbXrefs: [
            { identifier: "JGAP000001", type: "jga-policy" },
            { identifier: "JGAS000001", type: "jga-study" },
            { identifier: "JGAS999999", type: "jga-study" },
          ],
        },
      },
    })

    const result = await fetchJgaParentStudyId("JGAD000001")
    expect(result).toBe("JGAS000001")
    expect(capturedRequests[0].url).toContain("/jga-dataset/_doc/JGAD000001")
  })

  it("returns null when no jga-study xref is present", async () => {
    stubFetch({
      body: {
        found: true,
        _source: { dbXrefs: [{ identifier: "JGAP000001", type: "jga-policy" }] },
      },
    })

    const result = await fetchJgaParentStudyId("JGAD000002")
    expect(result).toBeNull()
  })

  it("returns null when dbXrefs is absent", async () => {
    stubFetch({ body: { found: true, _source: {} } })

    const result = await fetchJgaParentStudyId("JGAD000003")
    expect(result).toBeNull()
  })

  it("returns null when the document is not found (found: false)", async () => {
    stubFetch({ body: { found: false } })

    const result = await fetchJgaParentStudyId("JGAD999999")
    expect(result).toBeNull()
  })

  it("returns null on 404 response", async () => {
    stubFetch({ status: 404, body: {} })

    const result = await fetchJgaParentStudyId("JGAD999998")
    expect(result).toBeNull()
  })

  it("throws DdbjSearchApiError on 500 response", async () => {
    stubFetch({ status: 500, body: {} })

    let caught: unknown = null
    try {
      await fetchJgaParentStudyId("JGAD000010")
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(DdbjSearchApiError)
  })

  it("throws DdbjSearchApiError on network error", async () => {
    stubFetch({ throwError: new Error("boom") })

    let caught: unknown = null
    try {
      await fetchJgaParentStudyId("JGAD000011")
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(DdbjSearchApiError)
  })

  it("throws DdbjSearchApiError on invalid JSON", async () => {
    stubFetch({ bodyText: "not json" })

    let caught: unknown = null
    try {
      await fetchJgaParentStudyId("JGAD000012")
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(DdbjSearchApiError)
  })

  it("propagates X-Request-ID header when requestId is provided", async () => {
    stubFetch({ body: { found: true, _source: { dbXrefs: [] } } })

    await fetchJgaParentStudyId("JGAD000020", { requestId: "req-abc" })
    expect(capturedRequests[0].headers["X-Request-ID"]).toBe("req-abc")
  })

  it("caches hits so subsequent calls do not hit fetch", async () => {
    stubFetch({
      body: {
        found: true,
        _source: { dbXrefs: [{ identifier: "JGAS000005", type: "jga-study" }] },
      },
    })

    const r1 = await fetchJgaParentStudyId("JGAD000030")
    const r2 = await fetchJgaParentStudyId("JGAD000030")
    expect(r1).toBe("JGAS000005")
    expect(r2).toBe("JGAS000005")
    expect(capturedRequests).toHaveLength(1)
  })

  it("caches null results (dataset with no parent)", async () => {
    stubFetch({ body: { found: false } })

    const r1 = await fetchJgaParentStudyId("JGAD000031")
    const r2 = await fetchJgaParentStudyId("JGAD000031")
    expect(r1).toBeNull()
    expect(r2).toBeNull()
    expect(capturedRequests).toHaveLength(1)
  })

  it("does NOT cache thrown errors — retries on next call", async () => {
    let firstCall = true
    stubFetch(() => {
      if (firstCall) {
        firstCall = false
        return { status: 500, body: {} }
      }
      return {
        body: {
          found: true,
          _source: { dbXrefs: [{ identifier: "JGAS000042", type: "jga-study" }] },
        },
      }
    })

    let caught: unknown = null
    try {
      await fetchJgaParentStudyId("JGAD000042")
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(DdbjSearchApiError)

    const retried = await fetchJgaParentStudyId("JGAD000042")
    expect(retried).toBe("JGAS000042")
    expect(capturedRequests).toHaveLength(2)
  })
})
