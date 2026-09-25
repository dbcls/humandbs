/**
 * What a window is called, and the one place it is spelled.
 *
 * The order is a rule a reader notices only across screens — two windows open
 * on the same area, named front to back — so it is held here rather than left
 * to each `meta`.
 */

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { adminArea } from "~/admin/navigation"

import { messagesFor } from "./messages"
import { adminWindowTitle, windowTitle } from "./title"

const ROUTES = path.join(import.meta.dirname, "..", "routes")

const messages = messagesFor("ja")
const site = messages.siteName

describe("windowTitle", () => {
  it("この画面から外へ向かって並べ、サイト名で終える", () => {
    expect(windowTitle(messages, ["hum0006-v2", "hum0006", "研究一覧"]))
      .toBe(`hum0006-v2 | hum0006 | 研究一覧 | ${site}`)
  })

  it("要素が無ければサイト名だけになる", () => {
    expect(windowTitle(messages, [])).toBe(site)
  })

  it("無い要素は抜け、別の語で埋めない", () => {
    expect(windowTitle(messages, [null, "公開前の確認"])).toBe(`公開前の確認 | ${site}`)
    expect(windowTitle(messages, ["JGAD000001", undefined, "  ", "公開前の確認"]))
      .toBe(`JGAD000001 | 公開前の確認 | ${site}`)
  })

  it("直前と同じ要素は 1 度だけ書き、離れた同じ語は残す", () => {
    expect(windowTitle(messages, ["研究", "研究", "Admin"])).toBe(`研究 | Admin | ${site}`)
    expect(windowTitle(messages, ["研究", "hum0006", "研究"])).toBe(`研究 | hum0006 | 研究 | ${site}`)
    expect(windowTitle(messages, [site])).toBe(site)
  })

  const steps = fc.array(fc.option(fc.string(), { nil: null }), { maxLength: 6 })

  it("空の要素を挟まず、隣り合う要素が同じ語になることがない", () => {
    fc.assert(fc.property(steps, (given) => {
      const parts = windowTitle(messages, given).split(" | ")
      for (const [i, part] of parts.entries()) {
        expect(part.trim()).not.toBe("")
        if (i > 0) expect(part).not.toBe(parts[i - 1])
      }
    }))
  })

  it("いつもサイト名で終わり、最初の空でない要素で始まる", () => {
    fc.assert(fc.property(steps, (given) => {
      const title = windowTitle(messages, given)
      const first = given.map((one) => one?.trim() ?? "").find((one) => one !== "") ?? site
      expect(title.endsWith(site)).toBe(true)
      expect(title.startsWith(first)).toBe(true)
    }))
  })
})

describe("adminWindowTitle", () => {
  it.each([
    ["/admin", "トップ", null, `トップ | Admin | ${site}`],
    ["/admin/research", "研究", null, `研究 | Admin | ${site}`],
    ["/admin/research/r1", "研究の編集", "hum0006", `研究の編集 | hum0006 | 研究 | Admin | ${site}`],
    [
      "/admin/research/r1/draft/d1/dataset/x1",
      "データセットの編集",
      "JGAD000001",
      `データセットの編集 | JGAD000001 | 研究 | Admin | ${site}`,
    ],
    [
      "/admin/research/upstream/J-DS000136-010",
      "データ提供申請の内容",
      "J-DS000136-010",
      `データ提供申請の内容 | J-DS000136-010 | データ提供申請 | Admin | ${site}`,
    ],
    ["/admin/documents/d1", "記事の編集", "guidelines", `記事の編集 | guidelines | 記事 | Admin | ${site}`],
  ])("%s は %s のウィンドウのタイトルになる", (at, name, subject, expected) => {
    expect(adminWindowTitle(messages, at, name, subject)).toBe(expected)
  })
})

describe("adminArea", () => {
  it("バーの項目は、メニューの語ではなくその項目の画面の見出しで表示する", () => {
    expect(adminArea(messages.admin, "/admin/research/r1")).toBe(messages.admin.research.heading)
    expect(adminArea(messages.admin, "/admin/research/r1")).not.toBe(messages.admin.tasks.research.find)
  })

  it("別の項目の下にあるアドレスは、深いほうの項目の見出しになる", () => {
    expect(adminArea(messages.admin, "/admin/research/upstream")).toBe(messages.admin.templates.heading)
  })

  it("管理画面の外と、名前の途中で切れるアドレスはどの項目にも入らない", () => {
    expect(adminArea(messages.admin, "/research/hum0006")).toBeNull()
    expect(adminArea(messages.admin, "/admin/researchers")).toBeNull()
  })
})

/**
 * **A screen cannot spell its own title.** The order was written out by hand on
 * every screen and had split in two — half named the subject first and half the
 * role — which is the kind of difference nobody sees on the screen they are
 * working on.
 */
describe("画面の title", () => {
  it("どの画面も windowTitle を通し、管理画面は adminWindowTitle を通す", async () => {
    const names = (await readdir(ROUTES))
      .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
    const offenders: string[] = []
    for (const name of names) {
      const text = await readFile(path.join(ROUTES, name), "utf8")
      if (!text.includes("export function meta")) continue
      const through = name.startsWith("admin") ? "adminWindowTitle(" : "windowTitle("
      if (!text.includes(through)) offenders.push(`${name}: ${through} を通していない`)
      if (text.includes("title: `")) offenders.push(`${name}: title を自分で組み立てている`)
    }
    expect(offenders).toEqual([])
  })
})
