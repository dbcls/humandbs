import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { SeededFieldView, UpstreamBranchPageView, UpstreamBranchView } from "~/admin/templates.server"
import { BranchPairs } from "~/components/upstream"
import { messagesFor } from "~/i18n/messages"

import type { Route } from "./+types/admin-upstream-branch"
import AdminUpstreamBranch from "./admin-upstream-branch"

const FIELDS: SeededFieldView[] = [
  { field: "title", ja: "肺がんの研究", en: "A lung cancer study" },
  { field: "aims", ja: "目的です", en: "" },
  { field: "methods", ja: "", en: "" },
  { field: "targets", ja: "対象です", en: "Targets" },
  { field: "provider", ja: "松原 大祐", en: "Daisuke Matsubara" },
]

function draw(humLabel: string | null = "hum0455"): string {
  return renderToStaticMarkup(
    <BranchPairs locale="ja" branch={{ humLabel, approvedOn: "2026-07-28" }} fields={FIELDS} />,
  )
}

describe("枝番 1 本の申請の内容", () => {
  it("研究 ID・承認日と研究に入る値を 1 つの列挙に、研究の編集フォームと同じ名前で 1 度ずつ並べる", () => {
    const names = [...draw().matchAll(/<dt[^>]*>([^<]*)</g)].map((match) => match[1])
    expect(names).toEqual(["研究 ID", "承認日", "研究題目", "目的", "研究方法", "対象", "提供者"])
    expect(draw()).not.toContain("研究課題名")
    expect(draw()).not.toContain("研究代表者")
  })

  it("公開ページと同じ列挙の器 (Pairs) で描く", () => {
    expect(draw()).toMatch(/^<dl class="[^"]*sm:columns-2/)
  })

  it("空の言語は描かず、両方空なら未入力と言う", () => {
    const html = draw()
    const aims = html.slice(html.indexOf(">目的<"), html.indexOf("研究方法"))
    expect(aims).toContain(">ja<")
    expect(aims).not.toContain(">en<")
    const methods = html.slice(html.indexOf("研究方法"), html.indexOf(">対象<"))
    expect(methods).toContain("未入力")
  })

  it("研究 ID が無い枝番は未発行と言う", () => {
    expect(draw(null)).toContain("未発行")
  })
})

describe("枝番 1 本の画面の 2 つの状態", () => {
  const t = messagesFor("ja").admin.templates
  const held = { accession: "JGAD000958", description: "Whole genome sequencing", experiments: 1, heldBy: null }
  const branch: UpstreamBranchView = {
    applicationId: "J-DS000597-001",
    humLabel: "hum0597",
    approvedOn: "2026-08-03",
    titleJa: "下垂体癌の研究",
    titleEn: "",
    piName: "黒住 和彦",
    datasets: ["JGAD000958"],
    heldBy: null,
  }

  function screen(view: Partial<UpstreamBranchPageView>): string {
    const loaderData: UpstreamBranchPageView = {
      locale: "ja",
      connected: true,
      applicationId: "J-DS000597-001",
      branch,
      chosen: {
        applicationId: "J-DS000597-001",
        fields: FIELDS,
        datasets: [held],
        dropped: [{ keyCode: "platform", keyLabel: "プラットフォーム", value: "DNBSEQ-T7", at: null }],
        unreachable: [],
      },
      holder: null,
      ...view,
    }
    const props = { loaderData, actionData: undefined, params: {}, matches: [] } as unknown as Route.ComponentProps
    const Stub = createRoutesStub([{ path: "/*", Component: () => <AdminUpstreamBranch {...props} /> }])
    return renderToStaticMarkup(<Stub initialEntries={["/admin/research/upstream/J-DS000597-001"]} />)
  }

  it("研究が無ければ、研究の作成の節で作るものと反映されない値を並べ、研究 ID を名指して作成を始める", () => {
    const html = screen({})
    // The datasets are read under the application's values, before the section that makes the research.
    const registered = html.indexOf(`>${t.registered}</h2>`)
    const creating = html.indexOf(`>${t.creating}</h2>`)
    expect(html.indexOf(`>${t.branchSummary}</h2>`)).toBeLessThan(registered)
    expect(registered).toBeLessThan(creating)
    expect(html).toContain(t.droppedSaid)
    expect(html).toContain("DNBSEQ-T7")
    for (const line of t.createNote) expect(html).toContain(line)
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>[\s\S]*hum0597 の作成を開始/)
  })

  it("研究 ID が未発行なら、名指さずに作成を始める", () => {
    const html = screen({ branch: { ...branch, humLabel: null } })
    expect(html).toContain(t.createUnlabelled)
    expect(html).not.toMatch(/hum\d{4} の作成を開始/)
  })

  it("研究があれば何も作らず、登録されたデータセットは読ませ、作成済みの研究の節に説明とその研究への道を持つ", () => {
    const html = screen({ holder: { researchId: "r-597", humLabel: "hum0597" } })
    expect(html).not.toContain(t.creating)
    expect(html).not.toContain("DNBSEQ-T7")
    // What the application registered is read here as well.
    expect(html).toContain(`>${t.registered}</h2>`)
    expect(html).toContain("JGAD000958")
    expect(html).not.toMatch(/type="submit"/)
    expect(html).toContain(`>${t.heldHeading}</h2>`)
    for (const line of t.heldNote) expect(html).toContain(line)
    expect(html).toContain("hum0597 の研究の編集へ")
    expect(html).toContain("href=\"/admin/research/r-597\"")
  })
})
