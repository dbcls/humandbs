import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { datasetContentInput, type DatasetContentInput } from "~/admin/dataset-form"
import type { DatasetEditorView } from "~/admin/pages.server"
import type { EditableCatalog } from "~/admin/queries.server"
import { emptyDatasetContent, filled } from "~/content/empty"
import type { DatasetContent } from "~/content/types"
import { anchoredDatasetView, type CatalogView } from "~/public/view.server"
import type { DrawnDataset } from "~/review/preview.server"

import { DatasetEditor } from "./dataset-editor"

const TEXT_KEY = "00000000-0000-0000-0000-0000000000a1"
const VOCAB_KEY = "00000000-0000-0000-0000-0000000000a2"
const SPARE_KEY = "00000000-0000-0000-0000-0000000000a3"
const EXPERIMENT_KEY = "00000000-0000-0000-0000-0000000000a4"
const NUMBER_KEY = "00000000-0000-0000-0000-0000000000a5"
const DISEASE_KEY = "00000000-0000-0000-0000-0000000000a6"
const LABELLED_NUMBER_KEY = "00000000-0000-0000-0000-0000000000a7"
const SET = "00000000-0000-0000-0000-0000000000b1"
const ICD10_SET = "00000000-0000-0000-0000-0000000000b2"

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
      id: LABELLED_NUMBER_KEY,
      code: "variant-number",
      scope: "dataset",
      valueType: "number",
      labelJa: "バリアント数",
      labelEn: "Variant number",
      position: 5,
      vocabularySetId: null,
      multiple: false,
      canonicalUnit: null,
      inputUnits: null,
    },
    {
      id: DISEASE_KEY,
      code: "disease",
      scope: "dataset",
      valueType: "disease",
      labelJa: "疾患",
      labelEn: "Disease",
      position: 4,
      vocabularySetId: ICD10_SET,
      multiple: true,
      canonicalUnit: null,
      inputUnits: null,
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
}

/** Only what a document names comes with it; the rest is searched for. */
const TERMS = [
  {
    id: "term-open",
    setId: SET,
    code: "unrestricted",
    labelJa: "非制限公開",
    labelEn: "Unrestricted",
    position: 0,
  },
  {
    id: "term-k758",
    setId: ICD10_SET,
    code: "K758",
    labelJa: "その他の明示された炎症性肝疾患",
    labelEn: "Other specified inflammatory liver diseases",
    position: 0,
  },
]

/** Nothing in this fixture has values, so an empty catalog draws every place. */
const NO_CATALOG: CatalogView = { keyById: new Map(), keyByCode: new Map(), termById: new Map() }

/** The dataset drawn as its page, which the editor stands beside the form. */
function drawn(content: DatasetContent): DrawnDataset {
  const anchored = anchoredDatasetView({
    label: "hum0001-NHA001",
    humLabel: "hum0001",
    studyAccession: null,
    content,
    datePublished: null,
    dateModified: null,
    files: [],
  }, "ja", NO_CATALOG)
  return {
    humLabel: "hum0001",
    publishedNumber: null,
    label: "hum0001-NHA001",
    view: anchored.view,
    accessAnchor: null,
    typeOfDataAnchor: null,
    changed: [],
    previous: {},
  }
}

function view(
  content: DatasetContent = emptyDatasetContent(),
  portalIssued = true,
): DatasetEditorView {
  return {
    locale: "ja",
    researchId: "00000000-0000-0000-0000-000000000001",
    draftId: "00000000-0000-0000-0000-000000000002",
    datasetId: "00000000-0000-0000-0000-000000000003",
    humLabel: "hum0001",
    steps: { datasets: 0, shared: false, unresolved: 0, blocks: 0, findings: 0 },
    datasetLabel: portalIssued ? "hum0001-NHA001" : "JGAD000001",
    datasetPinId: "00000000-0000-0000-0000-000000000004",
    datasetIdSuggestion: null,
    published: true,
    updating: null,
    portalIssued,
    terms: TERMS,
    page: drawn(content),
    box: [],
    revision: 2,
    input: datasetContentInput(content),
    catalog,
    presence: [],
    upstream: null,
    review: {
      changed: [],
      previous: {},
      comments: [],
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
    // The one it already carries is not offered again as a candidate.
    expect(html.split("データの種類").length - 1).toBe(1)
    // The two it does not carry are candidates to add, not empty fields — and
    // the picker that offers them is not a `<select>`.
    expect(html).toContain("備考")
    expect(html).not.toContain("アクセス制限</span>")
    expect(html).not.toContain("<option")
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
    expect(html).toContain("選択肢を探す")
  })

  it("shows nothing chosen as an empty vocabulary item rather than as no item", () => {
    const html = render(view({
      ...emptyDatasetContent(),
      values: [{ keyId: VOCAB_KEY, value: { kind: "vocabulary", termIds: filled([]) } }],
    }))

    expect(html).toContain("アクセス制限")
    expect(html).toContain("未選択")
  })

  it("puts a vocabulary item's own delete on its name row, ahead of its search box", () => {
    const html = render(view({
      ...emptyDatasetContent(),
      values: [{ keyId: VOCAB_KEY, value: { kind: "vocabulary", termIds: filled(["term-open"]) } }],
    }))

    const nameAt = html.indexOf("アクセス制限")
    const removeAt = html.indexOf("項目の削除")
    const searchAt = html.indexOf("選択肢を探す")
    expect(nameAt).toBeGreaterThan(-1)
    expect(removeAt).toBeGreaterThan(nameAt)
    expect(removeAt).toBeLessThan(searchAt)
  })

  it("stands a vocabulary item's two state marks after the search box, not ahead of the chosen values", () => {
    const html = render(view({
      ...emptyDatasetContent(),
      values: [{ keyId: VOCAB_KEY, value: { kind: "vocabulary", termIds: filled(["term-open"]) } }],
    }))

    const searchAt = html.indexOf("選択肢を探す")
    const markAt = html.indexOf("aria-label=\"未確定\"")
    expect(searchAt).toBeGreaterThan(-1)
    expect(markAt).toBeGreaterThan(searchAt)
  })

  it("puts every kind of value's own delete beside its own name, one per value", () => {
    const html = render(view({
      ...emptyDatasetContent(),
      values: [
        {
          keyId: TEXT_KEY,
          value: { kind: "text", text: { ja: filled([[{ text: "x" }]]), en: filled([]) } },
        },
        { keyId: VOCAB_KEY, value: { kind: "vocabulary", termIds: filled([]) } },
        {
          keyId: NUMBER_KEY,
          value: {
            kind: "number",
            values: filled([{
              label: null, value: 1, unit: "GB", inputValue: 1, inputUnit: "GB", high: null, inputHigh: null, note: null,
            }]),
          },
        },
        {
          keyId: DISEASE_KEY,
          value: { kind: "disease", diseases: filled([{ termIds: [], nameJa: "NASH", nameEn: "" }]) },
        },
      ],
    }))

    // `IconButton` says its name twice — `aria-label` and `title` — so one
    // button per value is two occurrences of the word.
    expect(html.split("項目の削除").length - 1).toBe(4 * 2)
  })

  it("shows a number as it was typed, beside the unit it was typed in", () => {
    const html = render(view({
      ...emptyDatasetContent(),
      values: [{
        keyId: NUMBER_KEY,
        value: {
          kind: "number",
          values: {
            state: "value",
            value: [{ label: null, value: 1536, unit: "GB", inputValue: 1.5, inputUnit: "TB", note: null }],
          },
        },
      }],
    }))

    expect(html).toContain("データ量")
    expect(html).toContain("value=\"1.5\"")
    // The unit stands in the site's own select: named on the closed box, lit in the list.
    expect(html).not.toContain("<select")
    expect(html).toContain("<span class=\"truncate\">TB</span>")
    expect(html).toMatch(/aria-selected="true"[^>]*>TB<\/button>/)
  })

  it("offers a width's upper-end box after the lower end, sharing its unit", () => {
    const html = render(view({
      ...emptyDatasetContent(),
      values: [{
        keyId: NUMBER_KEY,
        value: {
          kind: "number",
          values: {
            state: "value",
            value: [{
              label: null,
              value: 900,
              unit: "GB",
              inputValue: 0.9,
              inputUnit: "TB",
              high: 1300,
              inputHigh: 1.3,
              note: null,
            }],
          },
        },
      }],
    }))

    expect(html).toContain("value=\"0.9\"")
    expect(html).toContain("value=\"1.3\"")
    expect(html).toContain("〜")
    // One unit box for the whole row — not a second one for the upper end.
    expect(html.match(/aria-selected="true"[^>]*>TB<\/button>/g)).toHaveLength(1)
    expect(html).not.toContain("aria-invalid")
  })

  it("marks the upper-end box wrong when it is typed below the lower end", () => {
    const html = render(view({
      ...emptyDatasetContent(),
      values: [{
        keyId: NUMBER_KEY,
        value: {
          kind: "number",
          values: {
            state: "value",
            value: [{
              label: null,
              value: 1300,
              unit: "GB",
              inputValue: 1.3,
              inputUnit: "GB",
              high: 900,
              inputHigh: 0.9,
              note: null,
            }],
          },
        },
      }],
    }))

    const highBox = /<input[^>]*value="0\.9"[^>]*>/.exec(html)?.[0] ?? ""
    expect(highBox).toContain("aria-invalid=\"true\"")
    expect(highBox).toMatch(/aria-describedby="[^"]+"/)
    expect(html).toContain("上限は下限より小さくできない")
    // The lower-end box itself is not the one marked wrong.
    const lowBox = /<input[^>]*value="1\.3"[^>]*>/.exec(html)?.[0] ?? ""
    expect(lowBox).not.toContain("aria-invalid")
  })

  it("offers this key's label candidates on the label box, and no others", () => {
    const withCandidates = render(view({
      ...emptyDatasetContent(),
      values: [{
        keyId: LABELLED_NUMBER_KEY,
        value: {
          kind: "number",
          values: {
            state: "value",
            value: [
              { label: "常染色体", value: 1, unit: null, inputValue: 1, inputUnit: null, note: null },
              { label: "", value: 2, unit: null, inputValue: 2, inputUnit: null, note: null },
            ],
          },
        },
      }],
    }))

    expect(withCandidates).toContain("<datalist")
    expect(withCandidates).toContain("<option value=\"常染色体\"");
    ["X染色体", "Y染色体", "ミトコンドリア", "全ゲノム"].forEach((candidate) => {
      expect(withCandidates).toContain(`<option value="${candidate}"`)
    })

    const withoutCandidates = render(view({
      ...emptyDatasetContent(),
      values: [{
        keyId: NUMBER_KEY,
        value: {
          kind: "number",
          values: {
            state: "value",
            value: [{ label: null, value: 1536, unit: "GB", inputValue: 1.5, inputUnit: "TB", note: null }],
          },
        },
      }],
    }))

    expect(withoutCandidates).not.toContain("<datalist")
    expect(withoutCandidates).not.toContain("<option")
  })

  it("shows a disease as the name somebody wrote and the code it is filed under", () => {
    const html = render(view({
      ...emptyDatasetContent(),
      values: [{
        keyId: DISEASE_KEY,
        value: {
          kind: "disease",
          diseases: filled([{ termIds: ["term-k758"], nameJa: "NASH", nameEn: "NASH" }]),
        },
      }],
    }))

    expect(html).toContain("疾患")
    expect(html).toContain("value=\"NASH\"")
    // The classification's own heading stands beside the name rather than
    // instead of it: the two answer different questions.
    expect(html).toContain("その他の明示された炎症性肝疾患")
    expect(html).toContain("疾患の追加")
  })

  it("shows a disease naming no code as an ordinary row, not as an empty item", () => {
    const html = render(view({
      ...emptyDatasetContent(),
      values: [{
        keyId: DISEASE_KEY,
        value: {
          kind: "disease",
          diseases: filled([{ termIds: [], nameJa: "健常人由来iPS細胞", nameEn: null }]),
        },
      }],
    }))

    expect(html).toContain("健常人由来iPS細胞")
    expect(html).toContain("未選択")
    // The name is missing in one language, which is not a state: the box is
    // simply empty and the row is there to be written in.
    expect(html).toContain("疾患名 (英語)")
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
    expect(html).toContain("未確定")
  })

  it("says nothing about a conflict or refused markup until a save has been answered", () => {
    const html = render(view(described()))

    expect(html).not.toContain("別の場所で保存されました")
    expect(html).not.toContain("文として保存できない記法があります")
  })

  it("offers a file selection for a dataset the portal issued the id for", () => {
    expect(render(view(emptyDatasetContent(), true))).toContain("この研究の箱にあるファイル")
  })

  it("does not offer a file selection for a dataset an archive issued the id for", () => {
    expect(render(view(emptyDatasetContent(), false))).not.toContain("この研究の箱にあるファイル")
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

const RESEARCH_ID = "00000000-0000-0000-0000-000000000001"
const DRAFT_ID = "00000000-0000-0000-0000-000000000002"

describe("the head", () => {
  it("names the screen \"データセットの編集\", the dataset's own label beside it, and the way back to the list", () => {
    const html = render(view())
    expect(html).toContain("データセットの編集")
    expect(html).toContain("hum0001-NHA001")
    expect(html).toContain(`href="/admin/research/${RESEARCH_ID}/draft/${DRAFT_ID}/dataset"`)
    expect(html).toContain("データセットへ")
  })

  it("names the identifier \"ID 未発行\" while the dataset has none yet", () => {
    const html = render({ ...view(), datasetLabel: null, datasetPinId: null })
    expect(html).toContain("ID 未発行")
  })

  it("wears the version it updates as a badge beside the identifier", () => {
    expect(render({ ...view(), updating: 3 })).toContain("v3 を更新中")
  })

  it("carries no second line — a dataset is a part of the draft, not a face of its own", () => {
    const html = render(view())
    expect(html).not.toContain("研究の編集へ")
    expect(html).not.toContain("レビューと共有")
    expect(html).not.toContain("公開の確認")
  })
})

describe("the tools row", () => {
  it("draws the pane switch and the unresolved count once, on the tools row", () => {
    const html = render({ ...view(), steps: { datasets: 0, shared: false, unresolved: 2, blocks: 0, findings: 0 } })
    expect([...html.matchAll(/aria-label="表示 pane"/g)]).toHaveLength(1)
    expect(html).toContain("未解決のコメント 2 件")
    expect(html).toContain(`href="/admin/research/${RESEARCH_ID}/draft/${DRAFT_ID}/review"`)
  })
})

describe("the comment panel's own name", () => {
  /**
   * The page pane's own annotation needs a catalog to resolve a value slot's
   * place, which `NO_CATALOG` deliberately withholds — this fixture only
   * reaches the section-level spot the empty catalog still draws.
   */
  it("falls back to the section's own name where a value slot resolves no place of its own", () => {
    const withComment = view(described())
    withComment.review.comments = [{
      id: "c1",
      anchor: { kind: "dataset-field", datasetId: withComment.datasetId, path: "experiments" },
      authorName: "provider",
      bySignedIn: false,
      body: "この項目でよいか確認したい",
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    }]
    const html = render(withComment)
    expect(html).toContain("title=\"解析手法 のコメント\"")
  })
})
