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
