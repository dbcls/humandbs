import fc from "fast-check"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { CommentAnchor } from "~/content/types"

import { datasetContentInput, emptyValueInput, type DatasetContentInput } from "~/admin/dataset-form"
import type { DatasetEditorView } from "~/admin/pages.server"
import type { EditableCatalog } from "~/admin/queries.server"
import { emptyDatasetContent, filled } from "~/content/empty"
import type { DatasetContent } from "~/content/types"
import { anchoredDatasetView, type CatalogView } from "~/public/view.server"
import type { DrawnDataset } from "~/review/preview.server"

import { CandidateWords, ChoicesWay, comboKey, copiedExperiment, DatasetEditor } from "./dataset-editor"

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
    current: {},
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
    datasetLabel: portalIssued ? "NHA000001" : "JGAD000001",
    datasetPinId: "00000000-0000-0000-0000-000000000004",
    nextNhaId: null,
    published: true,
    updating: null,
    portalIssued,
    terms: TERMS,
    page: drawn(content),
    box: [],
    revision: 2,
    input: datasetContentInput(content),
    catalog,
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
    // The ones it does not carry are candidates in a box that opens as it is
    // entered — not empty fields, not a `<select>`, not a fold to open first.
    expect(html).not.toContain("備考")
    expect(html).toMatch(/<input[^>]*role="combobox"[^>]*aria-label="項目の追加"/)
    expect(html).not.toMatch(/<summary[^>]*>[\s\S]*?項目の追加/)
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

  it("says nothing about a conflict until a save has been answered", () => {
    const html = render(view(described()))

    expect(html).not.toContain("別の場所で保存されました")
  })

  it("offers a file selection for a dataset the portal issued the id for", () => {
    expect(render(view(emptyDatasetContent(), true))).toContain("ファイルの紐づけ")
  })

  it("does not offer a file selection for a dataset an archive issued the id for", () => {
    const html = render(view(emptyDatasetContent(), false))
    expect(html).not.toContain("ファイルの紐づけ")
    expect(html).not.toContain(`/admin/research/${RESEARCH_ID}/files`)
  })

  it("leads to the research's files screen in a new tab from the files section", () => {
    const html = render(view(emptyDatasetContent(), true))
    expect(html).toMatch(new RegExp(`href="/admin/research/${RESEARCH_ID}/files"[^>]*target="_blank"`))
  })
})

describe("what the form carries but does not show", () => {
  it("carries the file selection into the form", () => {
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
    expect(html).toContain("NHA000001")
    expect(html).toContain(`href="/admin/research/${RESEARCH_ID}/draft/${DRAFT_ID}/dataset"`)
    expect(html).toContain("データセットへ")
  })

  it("names the identifier \"ID 未発行\" while the dataset has none yet", () => {
    const html = render({ ...view(), datasetLabel: null, datasetPinId: null })
    expect(html).toContain("ID 未発行")
  })

  it("offers the box for the id while the dataset has none, and proposes nothing into it", () => {
    const html = render({ ...view(), datasetLabel: null, datasetPinId: null, nextNhaId: "NHA000003" })
    expect(html).toMatch(/<input[^>]*aria-label="データセット ID"/)
    expect(html).toContain("NHA ID の発行")
    expect(html).not.toContain("NHA000003")
  })

  it("offers neither once the dataset has an id", () => {
    const html = render(view())
    expect(html).not.toContain("NHA ID の発行")
    expect(html).not.toContain("value=\"issue\"")
  })

  it("wears the version it updates as a badge beside the identifier", () => {
    expect(render({ ...view(), updating: 3 })).toContain("v3 を更新中")
  })

  it("carries no second line — a dataset is a part of the draft, not a face of its own", () => {
    const html = render(view())
    expect(html).not.toContain("研究の編集へ")
    expect(html).not.toContain("レビューと共有")
    expect(html).not.toContain("公開前の確認")
  })
})

describe("the tools row", () => {
  /** The research's form opens the same panel; here it holds this dataset's questions only. */
  it("draws the pane switch once, and the open-comments panel counting this dataset's open questions only", () => {
    const base = view()
    const said = (id: string, anchor: CommentAnchor, resolved = false) => ({
      id, anchor, authorName: "provider", bySignedIn: false, body: id, resolved,
      resolvedBy: null, resolvedAt: null, createdAt: "2026-01-01T00:00:00.000Z",
    })
    base.review.comments = [
      said("mine-1", { kind: "dataset-field", datasetId: base.datasetId, path: "values.k1" }),
      said("mine-2", { kind: "dataset-field", datasetId: base.datasetId, path: "experiments" }),
      said("mine-resolved", { kind: "dataset-field", datasetId: base.datasetId, path: "values.k1" }, true),
      said("other-dataset", { kind: "dataset-field", datasetId: "another", path: "values.k1" }),
      said("research", { kind: "research-field", path: "title" }),
      said("whole", { kind: "draft" }),
    ]
    const html = render({ ...base, steps: { datasets: 0, shared: false, unresolved: 9, blocks: 0, findings: 0 } })
    expect([...html.matchAll(/aria-label="表示 pane"/g)]).toHaveLength(1)
    const entry = html.slice(html.indexOf(">未解決のコメント"), html.indexOf("</button>", html.indexOf(">未解決のコメント")))
    expect(entry).toMatch(/>2</)
    // No way off to the review screen: the questions are read here.
    expect(html).not.toContain(`href="/admin/research/${RESEARCH_ID}/draft/${DRAFT_ID}/review"`)
  })

  it("does not offer the take-in from the head", () => {
    expect(render(view())).not.toContain("/take\"")
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
    expect(html).toContain("title=\"解析手法 へのコメント\"")
  })
})

describe("the keys of the term box", () => {
  const typed = { open: false, active: 0, find: "ゲノム" }

  it("opens on Down or Up once closed, whether anything is typed or not, at the first option", () => {
    for (const find of ["", "  ", "ゲノム"]) {
      for (const key of ["ArrowDown", "ArrowUp"]) {
        expect(comboKey({ open: false, active: 3, find }, key, 5)?.state).toEqual({ open: true, active: 0, find })
      }
    }
  })

  it("walks the list round at both ends", () => {
    const open = { ...typed, open: true }
    expect(comboKey({ ...open, active: 4 }, "ArrowDown", 5)?.state.active).toBe(0)
    expect(comboKey({ ...open, active: 0 }, "ArrowUp", 5)?.state.active).toBe(4)
  })

  it("takes the walked-to option on Enter only while the list is open and holds something", () => {
    expect(comboKey({ ...typed, open: true }, "Enter", 3)).toEqual({ state: { ...typed, open: true }, choose: true })
    expect(comboKey({ ...typed, open: true }, "Enter", 0)?.choose).toBe(false)
    // Closed, Enter is still caught — the box never sends the form.
    expect(comboKey(typed, "Enter", 3)).toEqual({ state: typed, choose: false })
  })

  it("closes on Escape, empties on a second, and leaves a third to whatever is around it", () => {
    const first = comboKey({ ...typed, open: true }, "Escape", 3)
    expect(first?.state).toEqual({ ...typed, open: false })
    const second = comboKey(first?.state ?? typed, "Escape", 3)
    expect(second?.state.find).toBe("")
    expect(comboKey({ open: false, active: 0, find: "" }, "Escape", 3)).toBeNull()
  })

  it("leaves every other key to the box", () => {
    expect(comboKey(typed, "a", 3)).toBeNull()
    expect(comboKey(typed, "Tab", 3)).toBeNull()
  })

  it("never walks outside the list, whatever the list's length or where it stood", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 50 }),
      fc.integer({ min: -5, max: 60 }),
      fc.constantFrom("ArrowDown", "ArrowUp"),
      (count, active, key) => {
        const next = comboKey({ open: true, active, find: "x" }, key, count)?.state.active ?? -1
        return next >= 0 && next < count
      },
    ))
  })
})

describe("copying an experiment", () => {
  it("keeps the label and values under a new identity, and shares nothing with the original", () => {
    const original = {
      id: "e1",
      label: { state: "value" as const, text: "RNA-seq" },
      values: [],
    }
    const copy = copiedExperiment(original)
    expect(copy.id).not.toBe(original.id)
    expect(copy.label).toEqual(original.label)
    copy.label.text = "WGS"
    expect(original.label.text).toBe("RNA-seq")
  })
})

describe("where the page lands on the form", () => {
  /**
   * A press on the page goes to the field the form marks with the same place
   * (`form.tsx` の `landAt`). A kind of field that marks nothing sends it to the
   * section's first box instead — an experiment's label, whatever was pressed.
   */
  it("marks every kind of value with its place — text, vocabulary, number and disease alike", () => {
    const page = view()
    page.input = {
      ...page.input,
      values: [
        emptyValueInput(TEXT_KEY, "text"),
        emptyValueInput(VOCAB_KEY, "vocabulary"),
        emptyValueInput(NUMBER_KEY, "number"),
        emptyValueInput(DISEASE_KEY, "disease"),
      ],
    }
    const html = render(page)
    for (const key of [TEXT_KEY, VOCAB_KEY, NUMBER_KEY, DISEASE_KEY]) {
      expect(html, key).toContain(`data-at="values.${key}"`)
    }
  })

  it("runs the dataset's fields in the page's order — the type of data before the access type", () => {
    const page = view()
    page.input = { ...page.input, values: [emptyValueInput(VOCAB_KEY, "vocabulary"), emptyValueInput(TEXT_KEY, "text")] }
    page.page = { ...page.page, typeOfDataAnchor: `values.${TEXT_KEY}`, accessAnchor: `values.${VOCAB_KEY}` }
    const html = render(page)
    expect(html.indexOf(`data-at="values.${TEXT_KEY}"`)).toBeLessThan(html.indexOf(`data-at="values.${VOCAB_KEY}"`))
  })
})

describe("the head of the dataset's form", () => {
  it("carries the id and the dates, and says the archive's dates are read, not written", () => {
    const html = render(view(emptyDatasetContent(), false))
    const head = html.slice(0, html.indexOf("role=\"tablist\""))
    expect(head).toContain("JGAD000001")
    expect(head).toContain("公開日")
    expect(head).toContain("更新日")
    expect(head).toContain("外部アーカイブがその accession に持つ日付を表示する。")
    expect(head).not.toContain("type=\"date\"")
  })

  it("asks for no release date of a portal-issued id — the publish dates it — and says so", () => {
    const head = render(view()).split("role=\"tablist\"")[0] ?? ""
    expect(head).not.toContain("type=\"date\"")
    expect(head).toContain("公開日")
    expect(head).toContain("未公開")
    expect(head).toContain("初めて公開したバージョンの公開日が自動で入る")
  })

  it("stands the id's box and its buttons at the row's height, among the facts of the line", () => {
    const head = render({ ...view(), datasetLabel: null, datasetPinId: null }).split("role=\"tablist\"")[0] ?? ""
    expect(head).toMatch(/<input[^>]*aria-label="データセット ID"[^>]*class="[^"]*\bmin-h-6\b/)
    const buttons = [...head.matchAll(/<button[^>]*class="([^"]*)"[^>]*>[\s\S]*?<\/button>/g)]
      .filter((one) => /割り当て|NHA ID の発行/.test(one[0]))
    expect(buttons).toHaveLength(2)
    for (const one of buttons) expect(one[1]).toMatch(/\bmin-h-6\b/)
  })

  it("names the experiments once — by the section, not again by the field", () => {
    const html = render(view())
    const start = html.indexOf("<div id=\"experiments\" class=\"scroll-mt-32\">")
    const section = html.slice(start, html.indexOf("</section>", start))
    expect(start).toBeGreaterThan(-1)
    expect(section.split(">解析手法<").length - 1).toBe(1)
  })
})

describe("the dataset's own fields", () => {
  /** The page draws the type of data and the access type on every dataset, so the form always has them. */
  const anchored = (page: DatasetEditorView): DatasetEditorView => ({
    ...page,
    page: { ...page.page, typeOfDataAnchor: `values.${TEXT_KEY}`, accessAnchor: `values.${VOCAB_KEY}` },
  })

  it("heads each field with its own name, under no heading that names them in general", () => {
    const html = render(anchored(view(described())))
    expect(html).toMatch(/<h2[^>]*>データの種類/)
    expect(html).toMatch(/<h2[^>]*>アクセス制限/)
    expect(html).not.toContain("基本情報")
  })

  it("always has the type of data and the access type, even when the dataset carries neither, and offers neither to be removed or added", () => {
    const html = render(anchored(view()))
    expect(html).toContain(`data-at="values.${TEXT_KEY}"`)
    expect(html).toContain(`data-at="values.${VOCAB_KEY}"`)
    for (const key of [TEXT_KEY, VOCAB_KEY]) {
      const at = html.indexOf(`id="value-${key}"`)
      const section = html.slice(at, html.indexOf("</section>", at))
      expect(section, key).not.toContain("aria-label=\"項目の削除\"")
    }
    const adding = html.slice(html.indexOf("項目の追加"))
    expect(adding).not.toMatch(/>データの種類<\/button>|>アクセス制限<\/button>/)
  })

  it("lets any other field be removed from its heading", () => {
    const page = anchored(view())
    page.input = { ...page.input, values: [emptyValueInput(NUMBER_KEY, "number")] }
    const html = render(page)
    const at = html.indexOf(`id="value-${NUMBER_KEY}"`)
    const heading = html.slice(at, html.indexOf("</h2>", at))
    expect(heading).toContain("aria-label=\"項目の削除\"")
  })
})

describe("a candidate in the term box's list", () => {
  const term = { id: "term-ca2", setId: SET, code: "controlled-access-type-2", labelJa: "制限公開 (Type II)", labelEn: "Controlled-access (Type II)", position: 1 }
  const words = (kind?: "disease") => renderToStaticMarkup(<CandidateWords term={term} locale="ja" kind={kind} />)

  it("reads as its words, without the key it is stored under", () => {
    expect(words()).toContain("制限公開 (Type II)")
    expect(words()).not.toContain("controlled-access-type-2")
  })

  it("keeps a disease's code before its words, the code being what it is typed and told apart by", () => {
    const html = words("disease")
    expect(html.indexOf("controlled-access-type-2")).toBeGreaterThan(-1)
    expect(html.indexOf("controlled-access-type-2")).toBeLessThan(html.indexOf("制限公開"))
  })
})

describe("the way to a field's choices", () => {
  const key = (over: Partial<EditableCatalog["keys"][number]>) => ({ ...catalog.keys[0], ...over }) as EditableCatalog["keys"][number]
  const way = (over: Partial<EditableCatalog["keys"][number]>): string => {
    const Stub = createRoutesStub([{ path: "/*", Component: () => <ChoicesWay catalogKey={key(over)} locale="ja" /> }])
    return renderToStaticMarkup(<Stub initialEntries={["/admin/research/x/draft/y/dataset/z"]} />)
  }

  it("leads an experiment's vocabulary to its 「選べる値」, in a new tab so the form's unsaved work stays", () => {
    const html = way({ scope: "experiment", valueType: "vocabulary", code: "platform" })
    expect(html).toMatch(/<a href="\/admin\/experiment-fields\/platform" target="_blank"[^>]*>[\s\S]*選べる値/)
  })

  it("does the same for an experiment's disease", () => {
    expect(way({ scope: "experiment", valueType: "disease", code: "disease" })).toContain("/admin/experiment-fields/disease")
  })

  it("draws nothing for a dataset's own closed list, or a field that chooses from nothing", () => {
    expect(way({ scope: "dataset", valueType: "vocabulary", code: "access-criteria" })).not.toContain("<a")
    expect(way({ scope: "experiment", valueType: "text", code: "coverage" })).not.toContain("<a")
    expect(way({ scope: "experiment", valueType: "number", code: "read-length" })).not.toContain("<a")
  })
})

describe("the parts of an experiment's card", () => {
  it("stands the experiment, its items and the way to add one under three headings, in that order", () => {
    const html = render(view({ ...emptyDatasetContent(), experiments: [{ id: "e1", label: filled("RNA-seq"), values: [] }] }))
    const card = html.slice(html.indexOf("<details"), html.indexOf("</details>"))
    const headings = [...card.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((one) => one[1])
    expect(headings).toEqual(["解析手法", "項目", "項目の追加"])
    expect(card).toContain("項目はありません。")
    // The heading 「解析手法」 names the one box under it; no second name over the box.
    expect(card).not.toContain("表示ラベル")
  })
})

describe("adding an item", () => {
  it("waits for the 追加 button, which cannot be pressed until an item is chosen, and carries no mark of its own before the box", () => {
    const html = render(view(described()))
    const at = html.indexOf("aria-label=\"項目の追加\"")
    const around = html.slice(html.lastIndexOf("<div class=\"flex flex-wrap items-center gap-2\">", at), html.indexOf("</button>", at) + 9)
    expect(around).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*追加<\/button>/)
    expect(html).toContain("追加する項目を先に選んでください。")
    // The box stands alone: no glyph before it.
    expect(around.slice(0, around.indexOf("<input"))).not.toContain("<svg")
  })

  it("leads to 解析手法の表 from an experiment's items, and not from the dataset's own", () => {
    const withExperiment = render(view({ ...emptyDatasetContent(), experiments: [{ id: "e1", label: filled("RNA-seq"), values: [] }] }))
    const card = withExperiment.slice(withExperiment.indexOf("<details"), withExperiment.indexOf("</details>"))
    expect(card).toMatch(/<a href="\/admin\/experiment-fields" target="_blank"[^>]*>[\s\S]*解析手法の表/)
    const datasetOnly = render(view(described()))
    expect(datasetOnly).not.toContain("href=\"/admin/experiment-fields\"")
  })
})
