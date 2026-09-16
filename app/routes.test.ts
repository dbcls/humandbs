import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

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
      || path?.includes("/comments") === true
      // The draft drawn as its page, which the editor's second pane asks for
      // as the content changes. It answers with the drawing, not with a screen.
      || path?.endsWith("/page") === true
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

/** Where a screen is written, and so where one of these could be called. */
async function screenSources(): Promise<string[]> {
  const roots = ["components", "routes"].map((one) => path.join(import.meta.dirname, one))
  const found: string[] = []
  for (const root of roots) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
        found.push(path.join(root, entry.name))
      }
    }
  }
  return found
}

/**
 * The addresses an open editor talks to rather than navigates to, which
 * `routes.ts` registers once and without a language prefix.
 */
const TALKED_TO = [
  "draftCommentsPath",
  "draftPagePath",
  "datasetPagePath",
  "draftPresencePath",
]

/**
 * **Nothing looks wrong when one of these is given a prefix.** The address is
 * built, no route matches it, and the router answers 405 without a request ever
 * leaving the browser — so the editor a curator had open is replaced by the
 * error page a few seconds after it drew, with nothing in the network to point
 * at. It cannot happen in Japanese, where the prefix is the empty string, which
 * is why the screens have to be read rather than opened.
 */
describe("編集画面が叩く道", () => {
  it("言語の接頭辞を付けて呼ばれていない", async () => {
    const wrapped = new RegExp(`href\\([^()]*,\\s*(?:${TALKED_TO.join("|")})\\(`)
    const offenders: string[] = []
    for (const file of await screenSources()) {
      if (wrapped.test(await readFile(file, "utf8"))) offenders.push(path.basename(file))
    }
    expect(offenders).toEqual([])
  })
})
