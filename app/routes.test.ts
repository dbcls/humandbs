import { describe, expect, it, vi } from "vitest"

/**
 * The route list is evaluated once, when the module is imported, so a test that
 * wants to see it under a different environment has to ask for the module
 * again.
 */
async function routesUnder(nodeEnv: string): Promise<string> {
  const before = process.env.NODE_ENV
  process.env.NODE_ENV = nodeEnv
  vi.resetModules()
  try {
    return JSON.stringify((await import("./routes")).default)
  } finally {
    process.env.NODE_ENV = before
    vi.resetModules()
  }
}

describe("the route list", () => {
  it("leaves the parts catalogue out of a production build", async () => {
    expect(await routesUnder("production")).not.toContain("dev/ui")
  })

  it("registers the parts catalogue anywhere else", async () => {
    expect(await routesUnder("development")).toContain("dev/ui")
  })

  it("registers the public pages in both languages either way", async () => {
    for (const nodeEnv of ["production", "development"]) {
      const registered = await routesUnder(nodeEnv)
      expect(registered).toContain("\"research/:humId\"")
      expect(registered).toContain("\"en\"")
    }
  })
})
