import { describe, expect, it } from "vitest"

import { loader } from "./api-not-found"

describe("api-not-found", () => {
  it("problem+json の 404 を返し、エンドポイントの一覧の場所を示す", async () => {
    const request = new Request("https://humandbs.dbcls.jp/api/nope?q=x")
    const answer = loader({ request, params: {}, context: {} } as Parameters<typeof loader>[0])
    expect(answer.status).toBe(404)
    expect(answer.headers.get("content-type")).toBe("application/problem+json; charset=utf-8")
    expect(answer.headers.get("access-control-allow-origin")).toBe("*")
    expect(JSON.parse(await answer.text())).toEqual({
      type: "https://humandbs.dbcls.jp/problems/not-found",
      title: "Not Found",
      status: 404,
      detail: "No endpoint is at this address. The endpoints are listed in /api/openapi.json.",
      instance: "/api/nope?q=x",
    })
  })
})
