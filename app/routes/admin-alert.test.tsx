import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { AlertRow, ContentsResult } from "~/admin/contents.server"

import type { Route } from "./+types/admin-alert"
import AdminContentsAlert from "./admin-alert"

function alertRow(id: string, ja: string): AlertRow {
  return { id, active: false, displayFrom: null, displayUntil: null, period: "within", ja, en: "" }
}

function screen(alerts: AlertRow[], actionData: ContentsResult | undefined): string {
  const props = { loaderData: { locale: "ja", alerts }, actionData, params: {}, matches: [] } as unknown as Route.ComponentProps
  const Stub = createRoutesStub([{ path: "/*", Component: () => <AdminContentsAlert {...props} /> }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin/alert"]} />)
}

describe("保存を拒否されたアラートの本文", () => {
  const refused: ContentsResult = {
    status: "body",
    alertId: "second",
    problems: [{ locale: "ja", syntax: "html", line: 2 }],
  }

  it("問題のある行が、拒否されたアラートのその言語の欄の下に、行番号と一緒に表示される", () => {
    const html = screen([alertRow("first", "一つ目"), alertRow("second", "二つ目")], refused)

    expect(html.match(/2 行目: HTML のタグは書けません/g)).toHaveLength(1)
    expect(html.match(/その行へ/g)).toHaveLength(1)
    // 2 つ目のアラートの日本語の欄のあとで、英語の欄より前
    const second = html.indexOf("二つ目")
    const line = html.indexOf("2 行目")
    expect(second).toBeLessThan(line)
    expect(line).toBeLessThan(html.indexOf("name=\"en\"", second))
  })

  it("拒否された欄だけが誤りとして示され、行の一覧で説明される", () => {
    const html = screen([alertRow("first", "一つ目"), alertRow("second", "二つ目")], refused)

    expect(html.match(/aria-invalid="true"/g)).toHaveLength(1)
    const [, listId] = /<textarea[^>]*aria-describedby="([^"]+)"[^>]*>二つ目/.exec(html) ?? []
    expect(listId).toBeDefined()
    expect(html).toMatch(new RegExp(`<ul id="${listId ?? ""}"`))
  })

  it("保存が通ったときは、どの欄にも行を表示しない", () => {
    const html = screen([alertRow("first", "一つ目")], { status: "ok", done: "alert-saved" })

    expect(html).not.toContain("行目")
    expect(html).not.toContain("aria-invalid=\"true\"")
  })
})

describe("アラートの並び替え", () => {
  /** Each `<button>`'s attributes, in the order they are drawn. */
  const buttons = (html: string) => [...html.matchAll(/<button([^>]*)>/g)].map((match) => match[1] ?? "")
  const named = (html: string, label: string) => buttons(html).filter((attrs) => attrs.includes(`aria-label="${label}"`))
  const formBody = (html: string, id: string) => new RegExp(`<form[^>]*id="${id}"[^>]*>([\\s\\S]*?)</form>`).exec(html)?.[1] ?? ""

  it("上下のボタンは、本文のフォームの外にある intent と id だけのフォームを送る", () => {
    const html = screen([alertRow("first", "一つ目"), alertRow("second", "二つ目")], undefined)

    const target = /form="([^"]+)"/.exec(named(html, "上へ")[1] ?? "")?.[1] ?? ""
    const body = formBody(html, target)
    expect(body).toContain("name=\"intent\" value=\"move-alert-up\"")
    expect(body).toContain("name=\"alertId\" value=\"second\"")
    expect(body).not.toContain("<textarea")
  })

  it("最初のアラートは上へ、最後のアラートは下へ動かせない", () => {
    const html = screen([alertRow("first", "一つ目"), alertRow("second", "二つ目")], undefined)

    expect(named(html, "上へ").map((attrs) => attrs.includes(" disabled=\"\""))).toEqual([true, false])
    expect(named(html, "下へ").map((attrs) => attrs.includes(" disabled=\"\""))).toEqual([false, true])
  })

  it("上下のボタンは削除のボタンの左にある", () => {
    const html = screen([alertRow("first", "一つ目")], undefined)

    const down = html.indexOf("aria-label=\"下へ\"")
    expect(down).toBeGreaterThan(-1)
    expect(down).toBeLessThan(html.indexOf(">削除<", down))
  })
})
