import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { datasetContentInput, type DatasetContentInput } from "~/admin/dataset-form"
import type { DatasetEditorView } from "~/admin/pages.server"
import type { EditableCatalog } from "~/admin/queries.server"
import { emptyDatasetContent, filled } from "~/content/empty"
import type { DatasetContent } from "~/content/types"

import { DatasetEditor } from "./dataset-editor"

const TEXT_KEY = "00000000-0000-0000-0000-0000000000a1"
const VOCAB_KEY = "00000000-0000-0000-0000-0000000000a2"
const SPARE_KEY = "00000000-0000-0000-0000-0000000000a3"
const EXPERIMENT_KEY = "00000000-0000-0000-0000-0000000000a4"
const NUMBER_KEY = "00000000-0000-0000-0000-0000000000a5"
const SET = "00000000-0000-0000-0000-0000000000b1"

const catalog: EditableCatalog = {
  keys: [
    {
      id: TEXT_KEY,
      code: "type-of-data",
      scope: "dataset",
      valueType: "text",
      labelJa: "データの種類",
      labelEn: "Type of data",
      position: 0,
      vocabularySetId: null,
      multiple: false,
      canonicalUnit: null,
      inputUnits: null,
    },
    {
      id: VOCAB_KEY,
      code: "access-criteria",
      scope: "dataset",
      valueType: "vocabulary",
      labelJa: "アクセス制限",
      labelEn: "Access type",
      position: 1,
      vocabularySetId: SET,
      multiple: false,
      canonicalUnit: null,
      inputUnits: null,
    },
    {
      id: SPARE_KEY,
      code: "release-note",
      scope: "dataset",
      valueType: "text",
      labelJa: "備考",
      labelEn: "Notes",
      position: 2,
      vocabularySetId: null,
      multiple: false,
      canonicalUnit: null,
      inputUnits: null,
    },
    {
      id: NUMBER_KEY,
      code: "data-volume-gb",
      scope: "dataset",
      valueType: "number",
      labelJa: "データ量",
      labelEn: "Data volume",
      position: 3,
      vocabularySetId: null,
      multiple: false,
      canonicalUnit: "GB",
      inputUnits: ["MB", "GB", "TB"],
    },
    {
      id: EXPERIMENT_KEY,
      code: "coverage",
      scope: "experiment",
      valueType: "text",
      labelJa: "深度",
      labelEn: "Coverage",
      position: 0,
      vocabularySetId: null,
      multiple: false,
      canonicalUnit: null,
      inputUnits: null,
    },
  ],
  terms: [
    {
      id: "term-open",
      setId: SET,
      code: "unrestricted",
      labelJa: "非制限公開",
      labelEn: "Unrestricted",
      position: 0,
    },
    {
      id: "term-closed",
      setId: SET,
      code: "controlled",
      labelJa: "制限公開",
      labelEn: "Controlled",
      position: 1,
    },
  ],
}

function view(content: DatasetContent = emptyDatasetContent()): DatasetEditorView {
  return {
    locale: "ja",
    researchId: "00000000-0000-0000-0000-000000000001",
    draftId: "00000000-0000-0000-0000-000000000002",
    datasetId: "00000000-0000-0000-0000-000000000003",
    humLabel: "hum0001",
    datasetLabel: "JGAD000001",
    published: true,
    box: [],
    revision: 2,
    input: datasetContentInput(content),
    catalog,
    presence: [],
    undo: [],
    upstream: null,
    review: {
      changed: [],
      previous: {},
      threads: [],
      publishedNumber: null,
      signedInName: "curator",
    },
  }
}

function render(page: DatasetEditorView): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => <DatasetEditor view={page} /> }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin/research/x/draft/y/dataset/z"]} />)
}

function described(): DatasetContent {
  return {
    ...emptyDatasetContent(),
    values: [{
      keyId: TEXT_KEY,
      value: { kind: "text", text: { ja: filled([[{ text: "全ゲノムシークエンス" }]]), en: filled([]) } },
    }],
  }
}

describe("the dataset editing form", () => {
  it("shows only the items the dataset carries, and offers the rest to be added", () => {
    const html = render(view(described()))

    expect(html).toContain("データの種類")
    expect(html).toContain("全ゲノムシークエンス")
    // The two it does not carry are choices, not empty fields.
    expect(html).toContain("<option value=\"00000000-0000-0000-0000-0000000000a3\">備考</option>")
    expect(html).not.toContain("アクセス制限</span>")
  })

  it("shows the terms a vocabulary item holds and searches for the rest", () => {
    const html = render(view({
      ...emptyDatasetContent(),
      values: [{ keyId: VOCAB_KEY, value: { kind: "vocabulary", termIds: filled(["term-open"]) } }],
    }))

    expect(html).toContain("非制限公開")
    // The vocabulary is not listed: a set can hold thousands of terms, so the
    // unchosen ones are reached by typing rather than by scrolling. The chosen
    // label contains the unchosen one, so it is counted rather than looked for.
    expect(html.split("制限公開").length - 1).toBe(1)
    expect(html).toContain("語彙値をさがす")
  })

  it("shows nothing chosen as an empty vocabulary item rather than as no item", () => {
    const html = render(view({
      ...emptyDatasetContent(),
      values: [{ keyId: VOCAB_KEY, value: { kind: "vocabulary", termIds: filled([]) } }],
    }))

    expect(html).toContain("アクセス制限")
    expect(html).toContain("未選択")
  })

  it("shows a number as it was typed, beside the unit it was typed in", () => {
    const html = render(view({
      ...emptyDatasetContent(),
      values: [{
        keyId: NUMBER_KEY,
        value: {
          kind: "number",
          value: {
            state: "value",
            value: { value: 1500, unit: "GB", inputValue: 1.5, inputUnit: "TB" },
          },
        },
      }],
    }))

    expect(html).toContain("データ量")
    expect(html).toContain("value=\"1.5\"")
    expect(html).toContain("<option value=\"TB\" selected=\"\">TB</option>")
  })

  it("puts an experiment's items under the experiment rather than the dataset", () => {
    const html = render(view({
      ...emptyDatasetContent(),
      experiments: [{
        id: "exp-1",
        label: filled("JGAS000274（Exome）"),
        values: [{
          keyId: EXPERIMENT_KEY,
          value: { kind: "text", text: { ja: filled([[{ text: "30x" }]]), en: filled([]) } },
        }],
      }],
    }))

    expect(html).toContain("JGAS000274（Exome）")
    expect(html).toContain("深度")
    expect(html).toContain("30x")
    // A dataset-scoped key is not on offer inside an experiment: the only key
    // of that level is the one it already carries, so nothing is offered here.
    const experiments = html.slice(html.indexOf("id=\"experiments\""))
    expect(experiments).not.toContain("<option")
  })

  it("keeps the half-typed text of an item marked unsettled, and stops it being edited", () => {
    const html = render(view({
      ...emptyDatasetContent(),
      values: [{
        keyId: TEXT_KEY,
        value: {
          kind: "text",
          text: { ja: { state: "unknown" }, en: filled([[{ text: "half written" }]]) },
        },
      }],
    }))

    expect(html).toContain("half written")
    expect(html).toContain("disabled")
    expect(html).toContain("未確定にする")
  })

  it("says nothing about a conflict or refused markup until a save has been answered", () => {
    const html = render(view(described()))

    expect(html).not.toContain("別の場所で保存されました")
    expect(html).not.toContain("文として保存できない記法があります")
  })

  it("offers nothing to restore while the stack is empty", () => {
    expect(render(view())).toContain("履歴はまだありません")
  })
})

describe("what the form carries but does not show", () => {
  it("keeps a file selection it has no screen for", () => {
    const input: DatasetContentInput = datasetContentInput({
      ...emptyDatasetContent(),
      fileSelection: ["hum0001.v1.zip"],
    })

    expect(input.fileSelection).toEqual(["hum0001.v1.zip"])
  })
})
