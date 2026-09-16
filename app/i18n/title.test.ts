/**
 * What a window is called, and the one place it is spelled.
 *
 * The order is a rule a reader notices only across screens — two windows open
 * on the same area, named back to front — so it is held here rather than left
 * to each `meta` (`docs/ui.md` の「管理画面の枠」).
 */

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { messagesFor } from "./messages"
import { pageTitle } from "./title"

const ROUTES = path.join(import.meta.dirname, "..", "routes")

const messages = messagesFor("ja")

describe("pageTitle", () => {
  it("名前・識別子・サイト名の順に並べる", () => {
    expect(pageTitle(messages, "研究の編集", "hum0588"))
      .toBe(`研究の編集 - hum0588 - ${messages.siteName}`)
  })

  it("識別子が無いときは名前とサイト名だけになる", () => {
    expect(pageTitle(messages, "研究一覧")).toBe(`研究一覧 - ${messages.siteName}`)
    expect(pageTitle(messages, "研究の編集", null)).toBe(`研究の編集 - ${messages.siteName}`)
    expect(pageTitle(messages, "研究の編集", "")).toBe(`研究の編集 - ${messages.siteName}`)
  })

  it("空の段を挟まない — 区切りが 2 つ続くことがない", () => {
    fc.assert(fc.property(
      fc.string(),
      fc.option(fc.string(), { nil: null }),
      (name, subject) => {
        expect(pageTitle(messages, name, subject)).not.toContain(" -  - ")
      },
    ))
  })

  it("いつもサイト名で終わり、名前で始まる", () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1 }).filter((one) => one.trim() !== ""),
      fc.option(fc.string({ minLength: 1 }), { nil: null }),
      (name, subject) => {
        const title = pageTitle(messages, name, subject)
        expect(title.startsWith(name)).toBe(true)
        expect(title.endsWith(messages.siteName)).toBe(true)
      },
    ))
  })
})

/**
 * **A screen cannot spell its own title.** The order was written out by hand on
 * every screen and had split in two — half named the subject first and half the
 * role — which is the kind of difference nobody sees on the screen they are
 * working on.
 */
describe("管理画面の title", () => {
  it("どの画面も pageTitle を通す", async () => {
    const names = (await readdir(ROUTES))
      .filter((name) => name.startsWith("admin") && name.endsWith(".tsx")
        && !name.includes(".test."))
    const offenders: string[] = []
    for (const name of names) {
      const text = await readFile(path.join(ROUTES, name), "utf8")
      if (!text.includes("export function meta")) continue
      if (!text.includes("pageTitle(")) offenders.push(`${name}: pageTitle を通していない`)
      if (text.includes("title: `")) offenders.push(`${name}: title を自分で綴っている`)
    }
    expect(offenders).toEqual([])
  })
})
