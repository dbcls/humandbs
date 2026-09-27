import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { ImportView } from "~/admin/import.server"
import type { UpstreamBranchView } from "~/admin/templates.server"

import type { Route } from "./+types/admin-draft-import"
import AdminDraftImport from "./admin-draft-import"

function branch(applicationId: string, applicationType: UpstreamBranchView["applicationType"]): UpstreamBranchView {
  return {
    applicationId,
    humLabel: "hum0001",
    applicationType,
    approvedOn: "2026-07-28",
    titleJa: "研究の題目",
    titleEn: "",
    piName: "山田 太郎",
    datasets: ["JGAD000001"],
    heldBy: null,
  }
}

function screen(branches: UpstreamBranchView[]): string {
  const loaderData: ImportView = {
    locale: "ja",
    researchId: "00000000-0000-0000-0000-000000000001",
    draftId: "00000000-0000-0000-0000-000000000002",
    revision: 1,
    humLabel: "hum0001",
    rows: [],
    application: { allowed: true, connected: true, branches, unknown: null },
    chosen: null,
  }
  const props = { loaderData, actionData: undefined, params: {}, matches: [] } as unknown as Route.ComponentProps
  const Stub = createRoutesStub([{ path: "/*", Component: () => <AdminDraftImport {...props} /> }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin/research/x/draft/y/import"]} />)
}

describe("the import screen's table of data-providing applications", () => {
  it("shows each application's type after its ID, with the icon and the word the application listing uses", () => {
    const html = screen([branch("J-DS000001-001", "new"), branch("J-DS000001-002", "update")])
    const head = html.slice(html.lastIndexOf("<thead>"), html.lastIndexOf("</thead>"))
    const names = [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((cell) => (cell[1] ?? "").replace(/<[^>]+>/g, ""))
    expect(names.slice(0, 2)).toEqual(["提供申請 ID", "申請の種類"])
    const rows = html.slice(html.lastIndexOf("<tbody"))
    expect(rows).toMatch(/J-DS000001-001[\s\S]*?<svg[\s\S]*?新規[\s\S]*?J-DS000001-002[\s\S]*?<svg[\s\S]*?データ更新/)
  })
})
