import { describe, expect, it } from "vitest"

import { FLAG, type FlagKind } from "./flags"
import { ACTION_ICON, ICON_NAMES, SUBJECT_ICON } from "./icons"

/**
 * **A glyph means one thing** (`docs/ui.md` の「押せるもの」). There are three
 * tables — what a control does (`ACTION_ICON`), what a thing is
 * (`SUBJECT_ICON`) and what state it is in (`FLAG`) — and a glyph standing in
 * two of them is read in both senses at once. The only overlaps allowed are
 * the pairs below: a deed and the state it leaves, or a deed and the thing it
 * acts on, so that seeing the glyph in either place points at the same thing.
 */
const PAIRED: readonly (readonly [string, string])[] = [
  ["action:show", "state:live"],
  ["action:hide", "state:off"],
  ["action:withdraw", "state:hidden"],
  ["action:resolve", "state:resolved"],
  ["action:merge", "state:merging"],
  ["action:edit", "state:changed"],
  ["action:edit", "state:conflicted"],
  ["action:assign", "state:secondary"],
  // What sharing leaves is a link that opens: the same thing the glyph names when one is attached.
  ["action:assign", "state:shared"],
  ["action:chooseFile", "subject:staticFile"],
]

function entries(): { table: string, key: string, icon: string }[] {
  return [
    ...Object.entries(ACTION_ICON).map(([key, icon]) => ({ table: "action", key, icon })),
    ...Object.entries(SUBJECT_ICON).map(([key, icon]) => ({ table: "subject", key, icon })),
    ...(Object.keys(FLAG) as FlagKind[]).map((key) => ({ table: "state", key, icon: FLAG[key].icon })),
  ]
}

/** Every glyph that stands in more than one table, with the entries it stands for. */
function crossings(rows: readonly { table: string, key: string, icon: string }[]) {
  const byIcon = new Map<string, { table: string, key: string }[]>()
  for (const row of rows) byIcon.set(row.icon, [...byIcon.get(row.icon) ?? [], row])
  return [...byIcon.entries()].filter(([, users]) => new Set(users.map((one) => one.table)).size > 1)
}

function unpaired(rows: readonly { table: string, key: string, icon: string }[]): string[] {
  const paired = new Set(PAIRED.map(([a, b]) => [a, b].sort().join(" ")))
  const found: string[] = []
  for (const [icon, users] of crossings(rows)) {
    for (const a of users) {
      for (const b of users) {
        if (a.table >= b.table) continue
        const pair = [`${a.table}:${a.key}`, `${b.table}:${b.key}`].sort().join(" ")
        if (!paired.has(pair)) found.push(`${icon}: ${pair}`)
      }
    }
  }
  return found
}

describe("the three glyph tables", () => {
  it("share a glyph between two tables only where the pair is a deed and what it leaves or acts on", () => {
    expect(unpaired(entries())).toEqual([])
  })

  it("would catch a glyph borrowed across tables — the rule is not empty", () => {
    // The tables do cross, so the check has pairs to read …
    expect(crossings(entries()).length).toBeGreaterThanOrEqual(PAIRED.length - 2)
    // … and a state wearing a deed's glyph that is not its own is refused.
    expect(unpaired([...entries(), { table: "state", key: "borrowed", icon: ACTION_ICON.delete }]))
      .toEqual([`${ACTION_ICON.delete}: action:delete state:borrowed`])
  })

  it("names every pair against an entry that exists, so a renamed key cannot leave a pass behind", () => {
    const keys = new Set(entries().map((row) => `${row.table}:${row.key}`))
    for (const [a, b] of PAIRED) {
      expect(keys).toContain(a)
      expect(keys).toContain(b)
    }
  })

  it("gives no deed and no thing a glyph the icon set does not have", () => {
    for (const row of entries()) expect(ICON_NAMES).toContain(row.icon)
  })

  it("gives each thing its own glyph, so a way in is found by its shape", () => {
    const icons = Object.values(SUBJECT_ICON)
    expect(new Set(icons).size).toBe(icons.length)
  })

  it("draws a provider's application with a glyph of its own, not the memo's", () => {
    expect(SUBJECT_ICON.application).not.toBe(SUBJECT_ICON.memo)
    expect(SUBJECT_ICON.application).toBe("inbox")
  })
})
