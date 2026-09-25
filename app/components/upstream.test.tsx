import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { BRANCH_STATUSES } from "~/admin/listing"
import type { UpstreamBranchView, UpstreamChoiceView } from "~/admin/templates.server"
import { messagesFor } from "~/i18n/messages"

import { BranchCreate } from "~/routes/admin-upstream-branch"

import { BranchCells, BranchDatasets, BranchDialog, BranchPairs, BranchStatusBadge, BRANCH_STATUS_FLAG, UpstreamChoice } from "./upstream"

function routed(element: ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin/research/upstream/J-DS000001-001"]} />)
}

describe("枝番の一覧のポータル側の判定", () => {
  it("3 つの状態はマークだけで見分けられる", () => {
    const flags = new Set(BRANCH_STATUSES.map((branchStatus) => BRANCH_STATUS_FLAG[branchStatus]))
    expect(flags.size).toBe(BRANCH_STATUSES.length)
  })

  it("行に表示する語はペインの絞り込みの項目の語と同じで、マークは読み上げない", () => {
    const t = messagesFor("ja").admin.templates
    for (const branchStatus of BRANCH_STATUSES) {
      const html = renderToStaticMarkup(<BranchStatusBadge branchStatus={branchStatus} locale="ja" />)
      expect(html).toContain(t.branchStatuses[branchStatus])
      expect(html).toContain("aria-hidden=\"true\"")
    }
  })
})

const t = messagesFor("ja").admin.templates

function choice(over: Partial<UpstreamChoiceView> = {}): UpstreamChoiceView {
  return { applicationId: "J-DS000001-001", fields: [], datasets: [], dropped: [], unreachable: [], ...over }
}

const submitOf = (html: string): string => /<button[^>]*type="submit"[^>]*>/.exec(html)?.[0] ?? ""

describe("申請から作るものの一覧", () => {
  it("データセットだけを作る押し方は、作れるものが無ければ押せない", () => {
    const html = routed(<UpstreamChoice locale="ja" choice={choice()} submit={t.add} />)
    expect(submitOf(html)).toMatch(/disabled=""/)
  })

  it("選ばせない — checkbox は無く、研究に登録済みでないものだけを送る", () => {
    const one = { accession: "JGAD000001", description: "WGS", experiments: 1, heldBy: null }
    const held = { accession: "JGAD000002", description: "WES", experiments: 1, heldBy: "r-1" }
    const html = routed(<UpstreamChoice locale="ja" choice={choice({ datasets: [one, held] })} submit={t.add} />)
    expect(html).not.toContain("type=\"checkbox\"")
    const sent = [...html.matchAll(/<input type="hidden" name="accession" value="([^"]+)"/g)].map((match) => match[1])
    expect(sent).toEqual(["JGAD000001"])
    expect(submitOf(html)).not.toMatch(/disabled=""/)
  })

  it("1 つのアクセッションを調べた結果として並べ、「登録されたデータセット」の見出しを出さない", () => {
    const one = { accession: "JGAD000001", description: "WGS", experiments: 1, heldBy: null }
    const html = routed(<UpstreamChoice locale="ja" choice={choice({ datasets: [one] })} submit={t.add} />)
    expect(html).toContain("JGAD000001")
    expect(html).not.toContain(t.registered)
  })

  it("作成は見つけたデータセットと同じ行に、outline のボタン・行の高さで表示する", () => {
    const one = { accession: "JGAD000001", description: "WGS", experiments: 1, heldBy: null }
    const html = routed(<UpstreamChoice locale="ja" choice={choice({ datasets: [one] })} submit={t.add} />)
    const row = /<div class="flex flex-wrap items-center gap-3">([\s\S]*?)<\/button>/.exec(html)?.[1] ?? ""
    expect(row).toContain("JGAD000001")
    expect(submitOf(html)).toContain("bg-white")
    expect(submitOf(html)).not.toContain("bg-brand")
    expect(submitOf(html)).toContain("min-h-6")
  })

  it("押すものが無い読むだけの表示では、何も送らない", () => {
    const one = { accession: "JGAD000001", description: "WGS", experiments: 1, heldBy: null }
    expect(routed(<UpstreamChoice locale="ja" choice={choice({ datasets: [one] })} />)).not.toContain("name=\"accession\"")
  })

  it("作るものとして並べる表示では、研究に登録済みのものは作らない理由を示し、研究への経路は無く、解析手法の件数を出さない", () => {
    const held = { accession: "JGAD000002", description: "WES", experiments: 3, heldBy: "r-1" }
    const html = routed(<UpstreamChoice locale="ja" choice={choice({ datasets: [held] })} submit={t.add} />)
    expect(html).toContain(t.taken)
    expect(html).not.toContain("href=\"/admin/research/r-1\"")
    expect(html).not.toContain("解析手法 3 件")
  })
})

const BRANCH: UpstreamBranchView = {
  applicationId: "J-DS000137-010",
  humLabel: "hum0127",
  approvedOn: "2025-05-08",
  titleJa: "がん患者評価の研究",
  titleEn: "A study",
  piName: "山口 建",
  datasets: ["JGAD000958"],
  heldBy: "r-1",
}

describe("枝番の表の行", () => {
  it("承認日から後ろの列は、一覧と取り込みの表で同じ部品が同じ順に描く", () => {
    const html = routed(<table><tbody><tr><BranchCells row={BRANCH} locale="ja" /></tr></tbody></table>)
    const cells = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1] ?? "")
    expect(cells).toHaveLength(4)
    expect(cells[0]).toContain("2025-05-08")
    expect(cells[1]).toContain("がん患者評価の研究")
    expect(cells[2]).toContain("山口 建")
    expect(cells[3]).toContain("JGAD000958")
  })

  it("題目が日本語で無ければ英語で出す", () => {
    const html = routed(<table><tbody><tr><BranchCells row={{ ...BRANCH, titleJa: "" }} locale="ja" /></tr></tbody></table>)
    expect(html).toContain("A study")
  })

  it("提供申請 ID は押せるもので、押すまでダイアログは開かず、他の画面へは移動しない", () => {
    const html = routed(<BranchDialog applicationId="J-DS000137-010" locale="ja" />)
    expect(html).toMatch(/<button type="button"[^>]*>[\s\S]*J-DS000137-010/)
    expect(html).not.toContain("href=\"/admin/research/upstream/J-DS000137-010\"")
    expect(html).not.toContain(t.branchLoading)
  })
})

describe("ダイアログの中の申請の内容", () => {
  it("ダイアログでは提供申請 ID を最初の値として表示し、枝番の画面では表示しない (隣にあるため)", () => {
    const inPanel = renderToStaticMarkup(
      <BranchPairs locale="ja" branch={{ humLabel: "hum0127", approvedOn: "2025-05-08" }} fields={[]} applicationId="J-DS000137-010" />,
    )
    const names = [...inPanel.matchAll(/<dt[^>]*>([^<]*)</g)].map((match) => match[1])
    expect(names[0]).toBe(t.application)
    expect(inPanel).toContain("J-DS000137-010")
    const onScreen = renderToStaticMarkup(<BranchPairs locale="ja" branch={{ humLabel: "hum0127", approvedOn: "2025-05-08" }} fields={[]} />)
    expect(onScreen).not.toContain(t.application)
  })
})

describe("研究の作成の節", () => {
  const free = { accession: "JGAD000958", description: "Whole genome sequencing", experiments: 1, heldBy: null }
  const held = { accession: "JGAD000959", description: "WES", experiments: 1, heldBy: "r-9" }
  const draw = (over: Partial<UpstreamChoiceView> = {}): string =>
    routed(<BranchCreate locale="ja" choice={choice(over)} submit="hum0597 の作成を開始" />)

  it("見出しと何が起きるかの説明があり、押すものはその後に続く", () => {
    const html = draw({ datasets: [free] })
    const heading = html.indexOf(`>${t.creating}</h2>`)
    const note = html.indexOf(t.createNote[0] ?? "")
    const press = html.search(/<button[^>]*type="submit"/)
    expect(heading).toBeGreaterThan(-1)
    expect(note).toBeGreaterThan(heading)
    expect(press).toBeGreaterThan(note)
  })

  it("データセットは選ばせず、作成の節には並べない — 申請の内容の側で読む", () => {
    const html = draw({ datasets: [free, held] })
    expect(html).not.toContain("type=\"checkbox\"")
    expect(html).not.toContain("JGAD000958")
  })

  it("登録されたデータセットが無くても押せる", () => {
    expect(submitOf(draw())).not.toMatch(/disabled=""/)
  })

  it("選択肢に無い値は 1 つの欄にまとめ、名前と件数・欄の名前と値の対・作るとどうなるか の順に示し、表への経路は無く、無ければ何も示さない", () => {
    const drop = (keyLabel: string, value: string) => ({ keyCode: keyLabel, keyLabel, value, at: null })
    const html = draw({ dropped: [drop("実験方法", "Exome sequencing"), drop("プラットフォーム", "Illumina Genome Analyzer")] })
    const named = html.indexOf(t.droppedHeading(2))
    const rows = [...html.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((match) => [match[1], match[2]])
    expect(named).toBeGreaterThan(-1)
    expect(rows).toEqual([["実験方法", "Exome sequencing"], ["プラットフォーム", "Illumina Genome Analyzer"]])
    expect(html.indexOf(t.droppedSaid)).toBeGreaterThan(html.indexOf("Illumina Genome Analyzer"))
    expect(html).not.toContain("/admin/experiment-fields")
    expect(draw()).not.toContain(t.droppedSaid)
  })
})

describe("登録されたデータセットの節", () => {
  const free = { accession: "JGAD000958", description: "Whole genome sequencing", experiments: 1, heldBy: null }
  const held = { accession: "JGAD000959", description: "WES", experiments: 1, heldBy: "r-9" }

  it("ID はアーカイブを新しいタブで開き、説明を添え、チェックボックスは無い", () => {
    const html = routed(<BranchDatasets locale="ja" datasets={[free]} />)
    expect(html).toContain(`>${t.registered}</h2>`)
    expect(html).toMatch(/<a[^>]*target="_blank"[^>]*>[\s\S]*?JGAD000958/)
    expect(html).toContain("Whole genome sequencing")
    expect(html).not.toContain("type=\"checkbox\"")
  })

  it("どの行にもデータセットのアイコンが ID の前にあり、研究に登録済みかどうかで見た目を変えない", () => {
    const html = routed(<BranchDatasets locale="ja" datasets={[free, held]} />)
    const rows = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1] ?? "")
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row.indexOf("<svg")).toBeLessThan(row.indexOf("JGAD"))
    expect(html).not.toContain(t.taken)
    expect(html).not.toContain("href=\"/admin/research/r-9\"")
  })

  it("無ければ無いと表示する", () => {
    expect(routed(<BranchDatasets locale="ja" datasets={[]} />)).toContain(t.noDatasets)
  })
})
