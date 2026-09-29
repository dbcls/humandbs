import { once } from "node:events"
import { createServer } from "node:http"

import { afterEach, describe, expect, it, vi } from "vitest"

import { forwardToAssistant, isAssistantRunning } from "./proxy.server"

import type { IncomingMessage, Server, ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"

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

/** A server on a free local port, and its origin. */
async function listening(
  handle: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ server: Server, origin: string }> {
  const server = createServer(handle)
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const { port } = server.address() as AddressInfo
  return { server, origin: `http://127.0.0.1:${port}` }
}

async function closed(server: Server): Promise<void> {
  server.close()
  server.closeAllConnections()
  await once(server, "close")
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

describe("アシスタントが動いているかの確認", () => {
  it("アシスタントの origin が無ければ false を返し、fetch を呼ばない", async () => {
    const restore = withOrigin(undefined)
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    try {
      expect(await isAssistantRunning()).toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it.each([200, 204, 302, 404, 405, 500, 503])(
    "origin の root が %i を返せば、status に関わらず true を返す",
    async (status) => {
      const { server, origin } = await listening((_, response) => {
        response.writeHead(status, { Location: "/elsewhere" }).end()
      })
      const restore = withOrigin(origin)
      try {
        expect(await isAssistantRunning()).toBe(true)
      } finally {
        restore()
        await closed(server)
      }
    },
  )

  it("origin の root に HEAD を送り、エンドポイントには送らない", async () => {
    const seen: string[] = []
    const { server, origin } = await listening((request, response) => {
      seen.push(`${request.method} ${request.url}`)
      response.writeHead(404).end()
    })
    const restore = withOrigin(origin)
    try {
      await isAssistantRunning()
      expect(seen).toEqual(["HEAD /"])
    } finally {
      restore()
      await closed(server)
    }
  })

  it("origin の port で誰も待ち受けていなければ false を返す", async () => {
    const { server, origin } = await listening((_, response) => response.end())
    await closed(server)
    const restore = withOrigin(origin)
    try {
      expect(await isAssistantRunning()).toBe(false)
    } finally {
      restore()
    }
  })

  it("接続できても応答が返らないまま待つ時間を過ぎれば false を返す", async () => {
    const { server, origin } = await listening(() => {
      // Accepts the request and never responds.
    })
    const restore = withOrigin(origin)
    try {
      expect(await isAssistantRunning(100)).toBe(false)
    } finally {
      restore()
      await closed(server)
    }
  })

  it("origin のホスト名が引けなければ false を返す", async () => {
    const restore = withOrigin("http://assistant-api.invalid:8000")
    try {
      expect(await isAssistantRunning()).toBe(false)
    } finally {
      restore()
    }
  })
})
