import { describe, expect, it } from "vitest"

import { draftDatasets } from "./datasets"

const published = (id: string) => ({ id, originDraftId: null })
const madeBy = (id: string, originDraftId: string) => ({ id, originDraftId })

const ids = (rows: readonly { id: string }[]): string[] => rows.map((row) => row.id)

describe("下書きが公開するデータセット", () => {
  it("順を持つものは順に並ぶ", () => {
    const rows = [published("a"), published("b"), published("c")]

    expect(ids(draftDatasets(rows, "draft-1", ["c", "a", "b"]))).toEqual(["c", "a", "b"])
  })

  it("順が指定していないものは、渡された順のまま末尾に付く", () => {
    const rows = [published("a"), published("b"), published("c")]

    expect(ids(draftDatasets(rows, "draft-1", ["c"]))).toEqual(["c", "a", "b"])
  })

  it("順に指定されていても、研究に無いものは除かれる", () => {
    const rows = [published("a")]

    expect(ids(draftDatasets(rows, "draft-1", ["gone", "a"]))).toEqual(["a"])
  })

  it("順を 1 つも持たなくても、研究のデータセットは全部並ぶ", () => {
    const rows = [published("a"), published("b")]

    expect(ids(draftDatasets(rows, "draft-1", []))).toEqual(["a", "b"])
  })

  it("この下書きで作成したものは並び、他の下書きで作成したものは表示されない", () => {
    const rows = [published("a"), madeBy("mine", "draft-1"), madeBy("theirs", "draft-2")]

    expect(ids(draftDatasets(rows, "draft-1", []))).toEqual(["a", "mine"])
  })

  it("他の下書きのものは、順が指定していても出ない", () => {
    const rows = [madeBy("theirs", "draft-2"), published("a")]

    expect(ids(draftDatasets(rows, "draft-1", ["theirs", "a"]))).toEqual(["a"])
  })

  it("渡された行を書き換えない", () => {
    const rows = [published("b"), published("a")]

    draftDatasets(rows, "draft-1", ["a", "b"])

    expect(ids(rows)).toEqual(["b", "a"])
  })
})
