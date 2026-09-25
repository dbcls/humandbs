/**
 * What a place a comment is on is called, on every screen that lists the open
 * comments by place: the research editor's and the dataset editor's panel, the
 * review screen and the publish check.
 *
 * **The name is the headings above the place on the editor's page pane, largest
 * first, joined by ` / `**, starting from the research's hum ID or the dataset's
 * ID — `hum0034 / 研究概要 / 目的`, `JGAD000001 / 解析手法 1 (RNA-seq) / プラットフォーム`.
 * The same place has the same name on all four screens, so a comment read on
 * the review screen is found on the editor by the same words.
 *
 * **An element that is a row of a table in the editor is its row number and
 * what the table's first column shows**, cut to ten characters —
 * `行2 (日本医療研究開発機構…)`. The first column alone does not tell rows apart:
 * a research funded twice by one agency has two rows that begin the same way.
 * **An experiment is its number and its name** — `解析手法 2 (WES)` — for the
 * same reason: a dataset can hold three experiments all called WES.
 */

import type { DatasetContentInput } from "~/admin/dataset-form"
import type { ResearchContentInput, SlotState, TextInput } from "~/admin/form"
import type { CommentAnchor } from "~/content/types"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { researchFieldLabel } from "./research-fields"

/** What names the places of one draft. The server reads it; an editor replaces what its form holds. */
export interface PlaceSources {
  /** The research's primary hum label. */
  humLabel: string | null
  /**
   * Each list of the research content whose elements are rows of a table in the
   * editor, by its path: the rows in order, each with what its first column shows.
   */
  rows: Record<string, PlaceRow[]>
  /**
   * The research's datasets, each with its ID and, when the draft lists it, its
   * row number in the research's dataset table.
   */
  datasets: { id: string, label: string | null, number: number | null }[]
  /** Each dataset's experiments in order, with their names. */
  experiments: Record<string, { id: string, name: string }[]>
  /** The catalog's labels by key identity. */
  keyLabels: Record<string, string>
}

export interface PlaceRow {
  id: string
  /** What the table's first column shows: the value, the word for its state, or empty. */
  first: string
}

/** The lists of the research content that are tables of rows in the editor, and the column each shows first. */
const ROW_LISTS: Record<string, (content: ResearchContentInput, states: StateWords) => PlaceRow[]> = {
  "dataProviders": (content, states) => content.dataProviders.map((one) => ({ id: one.id, first: pairLine(one.name, states).text })),
  "researchProjects": (content, states) => content.researchProjects.map((one) => ({ id: one.id, first: pairLine(one.name, states).text })),
  "grants": (content, states) => content.grants.map((one) => ({ id: one.id, first: pairLine(one.agency.name, states).text })),
  "relatedPublications": (content, states) => content.relatedPublications.map((one) => ({ id: one.id, first: sideLine(one.title, states).text })),
  "listingSummary.dataProviders": (content, states) =>
    content.listingSummary.dataProviders.map((one) => ({ id: one.id, first: pairLine(one.name, states).text })),
}

/** The words for the two states a side can be set to instead of a value (`admin.editor.stateChoice`). */
export type StateWords = Record<Exclude<SlotState, "value">, string>

/**
 * What one side of a value shows in a line: its text, or the word for the
 * state it is set to instead. A side marked unsettled or not applicable has no
 * text to show, and a row showing 未入力 for it would suggest the curator has not
 * answered when they have.
 */
export function sideLine(side: TextInput, states: StateWords): { text: string, isState: boolean } {
  return side.state === "value" ? { text: side.text, isState: false } : { text: states[side.state], isState: true }
}

/** The Japanese side, or the English while the Japanese side is a value with nothing typed. */
export function pairLine(pair: { ja: TextInput, en: TextInput }, states: StateWords): { text: string, isState: boolean } {
  const ja = sideLine(pair.ja, states)
  return ja.text !== "" ? ja : sideLine(pair.en, states)
}

/** The rows of every table of the research content, as the editor's tables show them. */
export function placeRows(content: ResearchContentInput, locale: Locale): Record<string, PlaceRow[]> {
  const states = messagesFor(locale).admin.editor.stateChoice
  return Object.fromEntries(Object.entries(ROW_LISTS).map(([path, rowsOf]) => [path, rowsOf(content, states)]))
}

/** A dataset's experiments with their names, as its form holds them. */
export function placeExperiments(content: DatasetContentInput): { id: string, name: string }[] {
  return content.experiments.map((one) => ({ id: one.id, name: one.label.state === "value" ? one.label.text : "" }))
}

export const PLACE_SEPARATOR = " / "

export function placeName(anchor: CommentAnchor, sources: PlaceSources, locale: Locale): string {
  return placeSegments(anchor, sources, locale).join(PLACE_SEPARATOR)
}

export function placeSegments(anchor: CommentAnchor, sources: PlaceSources, locale: Locale): string[] {
  switch (anchor.kind) {
    case "research-field":
      return researchSegments(anchor.path, sources, locale)
    case "dataset-field":
      return datasetSegments(anchor.datasetId, anchor.path, sources, locale)
    default:
      return [messagesFor(locale).admin.editor.whole]
  }
}

const FIRST_CHARACTERS = 10

/** Characters as a reader counts them: a character outside the BMP or a joined emoji is one. */
const GRAPHEMES = new Intl.Segmenter("ja", { granularity: "grapheme" })

/** The first ten characters of what names an element, or null when nothing does. */
function shortened(text: string): string | null {
  const characters = [...GRAPHEMES.segment(text.trim())].map((one) => one.segment)
  if (characters.length === 0) return null
  return characters.length > FIRST_CHARACTERS ? `${characters.slice(0, FIRST_CHARACTERS).join("")}…` : characters.join("")
}

/** A row as a place: its number from 1, and its first column cut to ten characters. */
function rowName(rows: readonly PlaceRow[] | undefined, id: string, locale: Locale): string {
  const t = messagesFor(locale).admin.editor
  const at = rows?.findIndex((row) => row.id === id) ?? -1
  if (rows === undefined || at < 0) return t.placeRemoved
  return t.placeRow(at + 1, shortened(rows[at]?.first ?? ""))
}

/** The research content's sections whose elements are rows, by the heading the page gives each. */
function sectionOf(head: string, locale: Locale): string | undefined {
  const words = messagesFor(locale).research
  switch (head) {
    case "dataProviders": return words.dataProvider
    case "researchProjects": return words.researchProjects
    case "grants": return words.grants
    case "relatedPublications": return words.relatedPublications
    default: return undefined
  }
}

function researchSegments(path: string, sources: PlaceSources, locale: Locale): string[] {
  const messages = messagesFor(locale)
  const words = messages.research
  const t = messages.admin.editor
  const root = sources.humLabel ?? t.placeUnpinnedResearch
  const leaf = researchFieldLabel(path, locale) ?? path
  const [head = "", ...rest] = path.split(".")
  const section = sectionOf(head, locale)
  if (section !== undefined) {
    const [id, ...inside] = rest
    if (id === undefined) return [root, section]
    const row = rowName(sources.rows[head], id, locale)
    return inside.length === 0 ? [root, section, row] : [root, section, row, leaf]
  }
  switch (head) {
    case "summary":
      return rest.length === 0 ? [root, words.overview] : [root, words.overview, leaf]
    case "datasetIds":
      return [root, words.datasets]
    case "listingSummary": {
      const [part, id] = rest
      if (part === undefined) return [root, t.paneRow]
      if (part !== "dataProviders") return [root, t.paneRow, leaf]
      const providers = words.listingSummary.dataProviders
      return id === undefined
        ? [root, t.paneRow, providers]
        : [root, t.paneRow, providers, rowName(sources.rows["listingSummary.dataProviders"], id, locale)]
    }
    default:
      return [root, leaf]
  }
}

function datasetSegments(datasetId: string, path: string, sources: PlaceSources, locale: Locale): string[] {
  const messages = messagesFor(locale)
  const t = messages.admin.editor
  const d = messages.admin.datasetEditor
  const dataset = sources.datasets.find((one) => one.id === datasetId)
  const root = dataset === undefined
    ? t.placeRemovedDataset
    : dataset.label ?? t.placeUnpinnedDataset(dataset.number)
  const keyLabel = (key: string | undefined) => (key === undefined ? undefined : sources.keyLabels[key]) ?? d.values
  const [head, id, part, key] = path.split(".")
  switch (head) {
    case "values":
      return [root, keyLabel(id)]
    case "releaseDate":
      return [root, d.releaseDate]
    case "fileSelection":
      return [root, d.files]
    case "experiments": {
      if (id === undefined) return [root, d.experiments]
      const experiments = sources.experiments[datasetId] ?? []
      const at = experiments.findIndex((one) => one.id === id)
      const experiment = at < 0 ? t.placeRemovedExperiment : t.placeExperiment(at + 1, shortened(experiments[at]?.name ?? ""))
      if (part === undefined || part === "label") return [root, experiment]
      return [root, experiment, keyLabel(key)]
    }
    default:
      return [root, path]
  }
}
