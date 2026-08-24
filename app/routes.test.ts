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

interface Entry {
  id?: string
  file: string
  path?: string
  children?: Entry[]
}

async function treeUnder(nodeEnv: string): Promise<Entry[]> {
  return JSON.parse(await routesUnder(nodeEnv)) as Entry[]
}

function flatten(entries: Entry[]): Entry[] {
  return entries.flatMap((entry) => [entry, ...flatten(entry.children ?? [])])
}

/**
 * The management area's frame is set in one place (`routes/admin-layout.tsx`),
 * which only holds if every screen under `/admin` is actually inside it. A
 * screen registered beside the layout would look right until it was opened.
 */
describe("管理画面の登録", () => {
  it("画面はすべて 1 つの layout の中にある", async () => {
    const tree = await treeUnder("development")
    const layouts = flatten(tree).filter((entry) => entry.file === "routes/admin-layout.tsx")
    // One per language, the way the pages themselves are registered twice.
    expect(layouts).toHaveLength(2)

    const inside = new Set(layouts.flatMap((layout) =>
      (layout.children ?? []).map((child) => child.path)))
    const outside = flatten(tree)
      .filter((entry) => entry.path?.startsWith("admin") === true)
      .filter((entry) => !inside.has(entry.path))
      .map((entry) => entry.path)

    // What is left outside answers with data rather than with a page, so it has
    // no frame to be inside of.
    expect(outside.every((path) => path?.startsWith("admin/assistant/api") === true
      || path?.includes("/upload") === true
      || path?.includes("/presence") === true
      || path?.includes("/undo/") === true
      || path?.includes("/comments") === true
      || path === "admin/terms")).toBe(true)
  })

  it("アシスタントへの proxy は言語ごとに複製されていない", async () => {
    const registered = flatten(await treeUnder("development"))
      .filter((entry) => entry.file === "routes/admin-assistant-api.ts")
    expect(registered).toHaveLength(1)
    expect(registered[0]?.path).toBe("admin/assistant/api/*")
  })

  it("アシスタントの画面は両方の言語で開ける", async () => {
    const screens = flatten(await treeUnder("development"))
      .filter((entry) => entry.file === "routes/admin-assistant.tsx")
    expect(screens).toHaveLength(2)
  })
})
