/**
 * Every place under `app/` that writes to an existing `research_version` row.
 *
 * A published version's content is never rewritten — publishing only ever
 * inserts a row, and withdrawing deletes it. The one exception is merging a
 * vocabulary term: the term is a value the content points at by id rather than
 * part of the content itself, so merging one term into another has to rewrite
 * every version that pointed at it. Nothing in the schema stops a third call
 * site from appearing, so this reads the source tree for both an ORM update
 * and a raw `UPDATE research_version` statement and checks the result against
 * a list of the ones allowed, each with the one column it changes.
 */

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it } from "vitest"

const APP = path.join(import.meta.dirname, "../..")

/** Every `.ts` / `.tsx` under `app/`, less the tests. */
async function sources(): Promise<{ name: string, text: string }[]> {
  const found: { name: string, text: string }[] = []

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(path.join(APP, dir), { withFileTypes: true })) {
      const here = dir === "" ? entry.name : `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        await walk(here)
        continue
      }
      if (!/\.tsx?$/.test(entry.name) || entry.name.includes(".test.")) continue
      found.push({ name: here, text: await readFile(path.join(APP, here), "utf8") })
    }
  }

  await walk("")
  return found
}

/** How many times a file writes an existing `research_version` row, by either route. */
function writeCount(text: string): number {
  const drizzle = text.match(/\.update\(researchVersion\)/g) ?? []
  const raw = text.match(/UPDATE\s+research_version\b/gi) ?? []
  return drizzle.length + raw.length
}

/** The one call site the rule allows, and the single column it changes. */
const ALLOWED: readonly { file: string, count: number, reason: string }[] = [
  { file: "admin/catalog.server.ts", count: 1, reason: "merging a vocabulary term rewrites the content that pointed at it" },
]

describe("writes to an existing research_version row", () => {
  it("come only from the allowed call sites, each written once", async () => {
    const found = (await sources())
      .map(({ name, text }) => ({ name, count: writeCount(text) }))
      .filter(({ count }) => count > 0)
      .sort((a, b) => a.name.localeCompare(b.name))

    expect(found).toEqual(
      ALLOWED.map(({ file, count }) => ({ name: file, count })).sort((a, b) => a.name.localeCompare(b.name)),
    )
  })

  it("changes only the column the reason for the call site names", async () => {
    const byName = new Map((await sources()).map(({ name, text }) => [name, text]))

    for (const { file } of ALLOWED) {
      const text = byName.get(file)
      expect(text, `${file} no longer exists`).toBeDefined()

      const call = /\.update\(researchVersion\)\s*\.set\(\{([^}]*)\}\)/.exec(text ?? "")
      expect(call, `${file} no longer calls .update(researchVersion).set({ ... }) the way this rule expects`).not.toBeNull()

      const keys = [...(call?.[1] ?? "").matchAll(/(\w+)\s*:/g)].map((m) => m[1])
      expect(keys).toEqual(["content"])
    }
  })
})
