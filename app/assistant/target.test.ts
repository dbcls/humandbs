import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  assistantTarget,
  carriesBody,
  forwardedRequestHeaders,
  forwardedResponseHeaders,
} from "./target"

const ORIGIN = "http://assistant-api:8000"

describe("転送先", () => {
  it("何も指していない要求は API の根に行く", () => {
    expect(assistantTarget(ORIGIN, "", "")).toBe(`${ORIGIN}/api/`)
  })

  it("道のりをそのまま API の下に置く", () => {
    expect(assistantTarget(ORIGIN, "applications/abc123", ""))
      .toBe(`${ORIGIN}/api/applications/abc123`)
  })

  it("クエリを持って行く", () => {
    expect(assistantTarget(ORIGIN, "applications", "?page=2"))
      .toBe(`${ORIGIN}/api/applications?page=2`)
  })

  it("API の外へ登る節を拒む", () => {
    expect(assistantTarget(ORIGIN, "..", "")).toBeNull()
    expect(assistantTarget(ORIGIN, "applications/../../healthz", "")).toBeNull()
    expect(assistantTarget(ORIGIN, "../secret", "")).toBeNull()
  })

  it("節そのものが `..` でなければ拒まない", () => {
    expect(assistantTarget(ORIGIN, "..hidden", "")).toBe(`${ORIGIN}/api/..hidden`)
    expect(assistantTarget(ORIGIN, "report..pdf", "")).toBe(`${ORIGIN}/api/report..pdf`)
    expect(assistantTarget(ORIGIN, "a/b../c", "")).toBe(`${ORIGIN}/api/a/b../c`)
  })

  /**
   * A segment arrives decoded, so it can hold the characters that would end the
   * path if the address were assembled by pasting strings together.
   */
  it("節に混ざった `?` と `#` はクエリにならない", () => {
    const target = assistantTarget(ORIGIN, "applications?admin=1", "")
    expect(new URL(target ?? "").pathname).toBe("/api/applications%3Fadmin=1")
    expect(new URL(target ?? "").search).toBe("")
  })

  it("節が二重の斜線で始まっても別のホストにならない", () => {
    const target = assistantTarget(ORIGIN, "/example.com/x", "")
    expect(new URL(target ?? "").host).toBe("assistant-api:8000")
  })

  it("受け入れた道のりは、どれも API の下から出ない", () => {
    fc.assert(fc.property(fc.string(), fc.string(), (rest, search) => {
      const target = assistantTarget(ORIGIN, rest, search)
      if (target === null) return
      const url = new URL(target)
      expect(url.origin).toBe(ORIGIN)
      expect(url.pathname.startsWith("/api/")).toBe(true)
    }))
  })
})

describe("行きの header", () => {
  it("ポータルの資格情報を渡さない", () => {
    const kept = forwardedRequestHeaders(new Headers({
      "cookie": "humandbs_session=secret",
      "authorization": "Bearer token",
      "content-type": "application/json",
    }))
    expect(kept.get("cookie")).toBeNull()
    expect(kept.get("authorization")).toBeNull()
    expect(kept.get("content-type")).toBe("application/json")
  })

  it("接続に属する header を渡さない", () => {
    const kept = forwardedRequestHeaders(new Headers({
      "connection": "keep-alive",
      "transfer-encoding": "chunked",
      "upgrade": "websocket",
      "accept": "application/json",
    }))
    expect(kept.get("connection")).toBeNull()
    expect(kept.get("transfer-encoding")).toBeNull()
    expect(kept.get("upgrade")).toBeNull()
    expect(kept.get("accept")).toBe("application/json")
  })

  /** `Headers` lower-cases its names, so a header cannot hide behind its spelling. */
  it("綴りの大小によらず落とす", () => {
    const kept = forwardedRequestHeaders(new Headers({ Cookie: "humandbs_session=secret" }))
    expect([...kept.keys()]).toEqual([])
  })
})

describe("帰りの header", () => {
  it("ポータルの origin に cookie を置かせない", () => {
    const kept = forwardedResponseHeaders(new Headers({
      "set-cookie": "assistant=1",
      "content-type": "application/json",
    }))
    expect(kept.get("set-cookie")).toBeNull()
    expect(kept.get("content-type")).toBe("application/json")
  })

  it("解かれた body に合わない符号化と長さを渡さない", () => {
    const kept = forwardedResponseHeaders(new Headers({
      "content-encoding": "gzip",
      "content-length": "1024",
    }))
    expect([...kept.keys()]).toEqual([])
  })
})

describe("body を持つ method", () => {
  it("読み取りは持たない", () => {
    expect(carriesBody("GET")).toBe(false)
    expect(carriesBody("HEAD")).toBe(false)
  })

  it("綴りが小文字でも読み取りは読み取り", () => {
    expect(carriesBody("get")).toBe(false)
    expect(carriesBody("head")).toBe(false)
  })

  it("それ以外は持ちうる", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(carriesBody(method)).toBe(true)
    }
  })
})
