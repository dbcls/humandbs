import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { runHealthChecks } from "~/health.server"

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789".split("")

const message = fc
  .array(fc.constantFrom(...ALPHABET), { minLength: 16, maxLength: 40 })
  .map((chars) => chars.join(""))

describe("runHealthChecks", () => {
  it("keeps probe failure details out of the report", async () => {
    await fc.assert(fc.asyncProperty(message, async (detail) => {
      const report = await runHealthChecks([
        { name: "database", probe: () => Promise.reject(new Error(detail)) },
      ])

      expect(report).toEqual({ ok: false, checks: [{ name: "database", ok: false }] })
      expect(JSON.stringify(report)).not.toContain(detail)
    }))
  })
})
