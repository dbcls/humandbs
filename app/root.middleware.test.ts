import { describe, expect, it } from "vitest"

import { middleware } from "./root"

/**
 * The guard only protects the routes it is in front of. The root is in front
 * of all of them, so what has to hold is that the root runs it and that a
 * refused write never reaches the route.
 */
describe("the root middleware", () => {
  async function run(request: Request): Promise<{ status: number, reached: boolean }> {
    let reached = false
    const next = () => {
      reached = true
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    const [guard] = middleware
    if (guard === undefined) throw new Error("the root has no middleware")
    const answer = await guard({ request, params: {}, context: {} } as never, next)
    if (!(answer instanceof Response)) throw new Error("the guard answered with no response")
    return { status: answer.status, reached }
  }

  it("answers a cross-site write itself, without reaching the route", async () => {
    const answer = await run(new Request("https://humandbs.dbcls.jp/admin/research/R/draft/D/comments", {
      method: "POST",
      headers: { origin: "https://evil.dbcls.jp" },
    }))
    expect(answer).toEqual({ status: 403, reached: false })
  })

  it("hands a same-origin write and any read on to the route", async () => {
    const write = await run(new Request("https://humandbs.dbcls.jp/auth/logout", {
      method: "POST",
      headers: { origin: "https://humandbs.dbcls.jp" },
    }))
    expect(write).toEqual({ status: 204, reached: true })
    const read = await run(new Request("https://humandbs.dbcls.jp/research", { headers: { origin: "https://evil.example" } }))
    expect(read).toEqual({ status: 204, reached: true })
  })
})
