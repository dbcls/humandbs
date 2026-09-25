import { renderToStaticMarkup } from "react-dom/server"
import { createMemoryRouter, RouterProvider } from "react-router"
import { describe, expect, it } from "vitest"

import { researchContentInput, type DraftInput } from "~/admin/form"
import type { ResearchDatasetRow } from "~/admin/queries.server"
import { emptyResearchContent } from "~/content/empty"
import type { ImportSourceRow } from "~/admin/import.server"

import { researchParts, sourceName, SourceTable, ImportForm } from "./import"

const DATASETS: ResearchDatasetRow[] = [
  { id: "d1", label: "JGAD000141", pinId: null, published: true, portalIssued: false } as ResearchDatasetRow,
]

function draft(datasetIds: string[], externalIds: string[]): DraftInput {
  return {
    content: {
      ...researchContentInput(emptyResearchContent()),
      relatedPublications: [{
        id: "p1",
        title: { state: "value", text: "肺がんの論文" },
        doi: { state: "value", text: "" },
        datasetIds,
        externalIds,
      }],
    },
  }
}

function draw(mine: DraftInput, theirs: DraftInput): string {
  const form = (
    <ImportForm
      locale="ja"
      parts={researchParts("ja", DATASETS, [], [mine, theirs])}
      mine={mine}
      theirs={theirs}
      sourceLabel="v4"
      revision={1}
    />
  )
  const router = createMemoryRouter([{ path: "/", element: form }])
  return renderToStaticMarkup(<RouterProvider router={router} />)
}

describe("取り込みの画面の関連論文のデータセット", () => {
  it("場所の名前はどの論文の欄かを示す", () => {
    const html = draw(draft([], []), draft(["d1"], []))
    expect(html).toContain("関連論文 肺がんの論文: ")
  })

  it("読む 2 列はデータセットを ID のラベルで出し、identity を出さない。外部 ID はそのまま並ぶ", () => {
    const html = draw(draft([], ["JGAD000500"]), draft(["d1"], ["hum0001"]))
    expect(html).toContain("JGAD000141")
    expect(html).toContain("JGAD000500")
    expect(html).toContain("hum0001")
    expect(html).not.toMatch(/>d1</)
  })

  it("最終的な値の外部 ID の欄は取り込み元の外部 ID で開く", () => {
    const html = draw(draft([], ["JGAD000500"]), draft([], ["hum0001"]))
    const written = html.slice(html.indexOf("最終的な値"))
    expect(written).toContain("value=\"hum0001\"")
    expect(written).not.toContain("value=\"JGAD000500\"")
  })
})

describe("取り込み元の表", () => {
  const HERE = "d-here"
  const OTHER = "d-other"
  type Update = { id: string, updatedAt: string } | null

  /** Two versions, and this draft plus another as drafts unless an update merges one into a version. */
  function table({ v1 = null, v2 = null, drafts = [HERE, OTHER] }: { v1?: Update, v2?: Update, drafts?: string[] } = {}): string {
    const times: Record<string, string> = { [OTHER]: "2026-09-24T05:42:00Z", [HERE]: "2026-09-24T04:25:00Z" }
    const rows: ImportSourceRow[] = [
      ...drafts.map((id) => ({ kind: "draft" as const, id, updatedAt: times[id] ?? "" })),
      { kind: "version" as const, number: 2, updatedAt: "2026-09-23T14:07:00Z", releaseDate: "2025-01-01", update: v2 },
      { kind: "version" as const, number: 1, updatedAt: "2026-09-23T14:07:00Z", releaseDate: "2024-11-25", update: v1 },
    ]
    const router = createMemoryRouter([{
      path: "/",
      element: <SourceTable rows={rows} here="/import" current={HERE} humLabel="hum0481" locale="ja" />,
    }])
    return renderToStaticMarkup(<RouterProvider router={router} />)
  }
  const rowOf = (html: string, needle: string): string => {
    const at = html.indexOf(needle)
    return html.slice(html.lastIndexOf("<tr", at), html.indexOf("</tr>", at))
  }
  const disabledCount = (html: string): number => html.match(/disabled=""/g)?.length ?? 0

  it("取り込み先のこの下書きは表に載り、「この下書き」と表示され、押せない見た目で理由を示す", () => {
    const html = table()
    const self = rowOf(html, "2026-09-24 13:25")
    expect(self).toContain("この下書き")
    expect(self).toContain("取り込み先のこの下書きのため、選べません。")
    expect(html).not.toContain(`href="/import?draft=${HERE}"`)
    expect(disabledCount(html)).toBe(1)
  })

  it("他の下書きは選べ、「この下書き」を表示しない", () => {
    const other = rowOf(table(), "2026-09-24 14:42")
    expect(other).toContain(`href="/import?draft=${OTHER}"`)
    expect(other).not.toContain("この下書き")
  })

  /** The research's own screen draws an update as its version's row; so does this table. */
  it("この下書きがバージョンを更新していれば、そのバージョンの 1 行だけが押せず、下書きの行は表示されない", () => {
    const html = table({ v1: { id: HERE, updatedAt: "2026-09-24T06:38:00Z" }, drafts: [OTHER] })
    const v1 = rowOf(html, "2024-11-25")
    expect(v1).toContain("更新中")
    expect(v1).toContain("2026-09-24 15:38")
    expect(v1).toContain("この下書きで更新中の v1 のため、選べません。")
    expect(html).not.toContain(`draft=${HERE}`)
    expect(html).not.toContain("href=\"/import?version=1\"")
    expect(disabledCount(html)).toBe(1)
  })

  it("他の下書きが更新中のバージョンは 1 行のまま選べ、選ぶと更新中の内容を取り込む", () => {
    const html = table({ v2: { id: OTHER, updatedAt: "2026-09-24T07:00:00Z" }, drafts: [HERE] })
    const v2 = rowOf(html, "2025-01-01")
    expect(v2).toContain("更新中")
    expect(v2).toContain(`href="/import?draft=${OTHER}"`)
    expect(v2).not.toMatch(/disabled=""/)
  })

  it("更新されていないバージョンは、更新中を表示せずに選べる", () => {
    const html = table()
    expect(rowOf(html, "2024-11-25")).toContain("href=\"/import?version=1\"")
    expect(rowOf(html, "2024-11-25")).not.toContain("更新中")
  })
})

describe("取り込みの画面の一覧 (提供者など)", () => {
  function withProviders(...names: [string, string][]): DraftInput {
    const empty = { state: "value" as const, text: "" }
    const base = researchContentInput(emptyResearchContent())
    return {
      content: {
        ...base,
        dataProviders: names.map(([id, name]) => ({
          id,
          name: { ja: { state: "value" as const, text: name }, en: empty },
          organization: { name: { ja: empty, en: empty } },
        })),
      },
    }
  }

  it("2 つの側を欄と同じ比べ方で並べる: 下書きだけの要素は左で消え、取り込み元だけの要素は右で足される", () => {
    const html = draw(withProviders(["a", "山口 建"], ["b", "松原 誠"]), withProviders(["b", "松原 誠"], ["c", "鈴木 花子"]))
    expect(html).toMatch(/<del[^>]*>山口 建<\/del>/)
    expect(html).toMatch(/<ins[^>]*>鈴木 花子<\/ins>/)
    expect(html).not.toMatch(/<(del|ins)[^>]*>松原 誠</)
  })

  it("残す要素は名前の付いたカードの並びで、要素ごとにどちらの側にあるかを示す", () => {
    const html = draw(withProviders(["a", "山口 建"], ["b", "松原 誠"]), withProviders(["b", "松原 誠"], ["c", "鈴木 花子"]))
    expect(html).toContain("取り込み後に残す要素")
    const kept = html.slice(html.indexOf("取り込み後に残す要素"))
    expect(kept).toMatch(/山口 建<\/span><span[^>]*>現在の下書きのみ/)
    expect(kept).toMatch(/松原 誠<\/span><span[^>]*>両方/)
    expect(kept).toMatch(/鈴木 花子<\/span><span[^>]*>取り込み元のみ/)
    expect(kept.match(/type="checkbox"/g)).toHaveLength(3)
    expect(html).not.toContain("最終的な値</th>")
  })
})

describe("取り込み元の名前", () => {
  const minute = (at: string): string => at.slice(0, 16).replace("T", " ")

  it("下書きは更新日時で、バージョンを更新している下書きはそのバージョンで示す — 表の行と同じ", () => {
    expect(sourceName({ kind: "draft", id: "d", updatedAt: "2026-09-24T04:25", updating: null }, "ja", minute))
      .toBe("下書き (2026-09-24 04:25)")
    expect(sourceName({ kind: "draft", id: "d", updatedAt: "2026-09-24T04:25", updating: 4 }, "ja", minute))
      .toBe("v4 (更新中)")
  })
})
