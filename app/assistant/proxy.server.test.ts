import { afterEach, describe, expect, it, vi } from "vitest"

import { forwardToAssistant } from "./proxy.server"

function withOrigin(value: string | undefined): () => void {
  const before = process.env.HUMANDBS_ASSISTANT_ORIGIN
  if (value === undefined) delete process.env.HUMANDBS_ASSISTANT_ORIGIN
  else process.env.HUMANDBS_ASSISTANT_ORIGIN = value
  return () => {
    if (before === undefined) delete process.env.HUMANDBS_ASSISTANT_ORIGIN
    else process.env.HUMANDBS_ASSISTANT_ORIGIN = before
  }
}

/** The Response the call throws, read the way a loader's own catch would. */
async function thrown(pending: Promise<unknown>): Promise<Response> {
  try {
    await pending
  } catch (caught) {
    if (caught instanceof Response) return caught
    throw caught
  }
  throw new Error("expected a Response to be thrown")
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("アシスタントが起動していない環境", () => {
  it("アシスタントの origin が無ければ 503 を返し、fetch を呼ばない", async () => {
    const restore = withOrigin(undefined)
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    try {
      const request = new Request("http://localhost/admin/assistant/api/applications")
      const response = await thrown(forwardToAssistant(request, "applications"))
      expect(response.status).toBe(503)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })
})

describe("アシスタントへの中継", () => {
  it("fetch が失敗すれば 502 を返す", async () => {
    const restore = withOrigin("http://assistant-api:8000")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")))
    try {
      const request = new Request("http://localhost/admin/assistant/api/applications")
      const response = await thrown(forwardToAssistant(request, "applications"))
      expect(response.status).toBe(502)
    } finally {
      restore()
    }
  })

  it("アシスタントが応答すれば、その status をそのまま返す", async () => {
    const restore = withOrigin("http://assistant-api:8000")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok", { status: 200 })))
    try {
      const request = new Request("http://localhost/admin/assistant/api/applications")
      const response = await forwardToAssistant(request, "applications")
      expect(response.status).toBe(200)
    } finally {
      restore()
    }
  })
})
