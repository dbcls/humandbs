import { describe, expect, it } from "vitest"

import { runHealthChecks } from "~/health.server"

const resolves = () => Promise.resolve("ok")
const never = () => new Promise<never>(() => { /* never settles */ })

describe("runHealthChecks", () => {
  it("reports ok when every probe resolves", async () => {
    const report = await runHealthChecks([
      { name: "database", probe: resolves },
      { name: "storage", probe: resolves },
    ])

    expect(report).toEqual({
      ok: true,
      checks: [{ name: "database", ok: true }, { name: "storage", ok: true }],
    })
  })

  it("marks only the failing check but reports the whole run as not ok", async () => {
    const report = await runHealthChecks([
      { name: "database", probe: () => Promise.reject(new Error("connection refused")) },
      { name: "storage", probe: resolves },
    ])

    expect(report).toEqual({
      ok: false,
      checks: [{ name: "database", ok: false }, { name: "storage", ok: true }],
    })
  })

  it("reports ok for an empty list of checks", async () => {
    expect(await runHealthChecks([])).toEqual({ ok: true, checks: [] })
  })

  it("catches a probe that throws before returning a promise", async () => {
    const report = await runHealthChecks([
      { name: "database", probe: () => { throw new Error("no pool") } },
    ])

    expect(report.ok).toBe(false)
  })

  it("fails a probe that never settles once the timeout elapses", async () => {
    const report = await runHealthChecks(
      [{ name: "database", probe: never }],
      { timeoutMs: 5 },
    )

    expect(report).toEqual({ ok: false, checks: [{ name: "database", ok: false }] })
  })

  it("starts every probe before waiting on any of them", async () => {
    const gate: PromiseWithResolvers<void> = Promise.withResolvers()
    let started = 0
    const probe = async () => {
      started += 1
      await gate.promise
    }

    const pending = runHealthChecks([
      { name: "database", probe },
      { name: "storage", probe },
    ])
    await Promise.resolve()

    expect(started).toBe(2)
    gate.resolve()
    await pending
  })

  it("hands the original error to onError so it can be logged", async () => {
    const error = new Error("connection refused")
    const seen: [string, unknown][] = []

    await runHealthChecks(
      [{ name: "database", probe: () => Promise.reject(error) }],
      { onError: (name, cause) => seen.push([name, cause]) },
    )

    expect(seen).toEqual([["database", error]])
  })
})
