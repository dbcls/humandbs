import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * The rule that keeps concurrent editing honest is a rule about call sites:
 * every write to a draft goes through `drafts.server.ts`, and every function
 * there that changes an existing row takes the revision to check it against.
 *
 * Nothing in the type system says so. An update written somewhere else would
 * compile, would pass every other test, and would silently overwrite whatever
 * somebody else had saved. So the shape of the source is what is checked here —
 * the same reason a trigger would not do, one level up.
 */

const WRITER = "app/admin/drafts.server.ts"

const DRAFT_TABLES = ["researchDraft", "draftDatasetEntry", "draftUndo", "draftPresence"]

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return sources(path)
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return []
    return [path]
  })
}

/** `db.insert(researchDraft)` and its two siblings, wherever they are written. */
function writesTo(source: string, table: string): boolean {
  return new RegExp(`\\.(insert|update|delete)\\(\\s*${table}\\b`).test(source)
}

describe("writing to a draft", () => {
  it("happens in one module, so that every write can be made to carry a revision", () => {
    // The detector has to see the writes that are allowed, or it sees nothing.
    expect(writesTo(readFileSync(WRITER, "utf8"), "researchDraft")).toBe(true)

    const offenders = sources("app")
      .filter((path) => path !== WRITER)
      .filter((path) => {
        const source = readFileSync(path, "utf8")
        return DRAFT_TABLES.some((table) => writesTo(source, table))
      })

    expect(offenders).toEqual([])
  })

  it("is checked against a revision by every function that changes a row", () => {
    const source = readFileSync(WRITER, "utf8")

    expect(changingFunctions(source)).toEqual([
      "saveDraftContent",
      "saveDatasetEntry",
      "createDatasetInDraft",
      "deleteDraftDataset",
      // Taking the draft away. Publishing calls it too, inside its own
      // transaction, which is how a publish stays inside this rule.
      "consumeDraft",
      "discardDraft",
    ])
    // The two mutable rows under a draft, each checked against its own.
    expect(source).toContain("eq(researchDraft.revision, at.revision)")
    expect(source).toContain("eq(draftDatasetEntry.revision, revision)")
  })

  it("takes no revision only where there is nothing to check against", () => {
    const source = readFileSync(WRITER, "utf8")
    const changing = new Set(changingFunctions(source))
    const exported = [...source.matchAll(/export async function (\w+)/g)]
      .map((match) => match[1] ?? "")

    // Two of these create a row, which has no earlier version of itself to
    // disagree with. The third is presence, which is not content: nobody reads
    // it for correctness and a lost write costs one heartbeat.
    expect(exported.filter((name) => !changing.has(name)))
      .toEqual(["createResearchWithDraft", "createDraft", "touchPresence"])
  })
})

/** Every exported function whose second argument names what it is changing. */
function changingFunctions(source: string): string[] {
  const declarations = source.matchAll(
    /export async function (\w+)\(\s*\n?\s*db: \w+,\s*\n?\s*at: (DraftAt|DatasetEntryAt)\b/g,
  )
  return [...declarations].map((match) => match[1] ?? "")
}
