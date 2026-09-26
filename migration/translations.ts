/**
 * The other language of values an article wrote in one language only.
 *
 * Each research page had a Japanese and an English article, and a few cells of
 * one of them were left empty — or a whole draft was written in Japanese only.
 * The page shows the other language in their place and marks it untranslated;
 * these are translated by hand instead, one value at a time, where the value
 * is also language-neutral (an accession, a URL, a software name) the same
 * words.
 *
 * A dataset's entry names the research, the dataset, the experiment (none for a
 * value of the dataset itself), the key and the empty language; a research's
 * own values are found by the words of their other language
 * (`ResearchTranslation`). **It fills only an empty language whose other
 * language is written, and an entry that lands nowhere stops the load**: the
 * value has moved, or has been written since.
 */

import type { DatasetContent, Line, RichText, TranslatedRichText, ValueSlot } from "~/content/types"

export interface Translation {
  hum: string
  /** The dataset's primary ID, the NHA ID where the portal issued one. */
  dataset: string
  /** `experiment-1` and so on; null for a value of the dataset itself. */
  experiment: string | null
  /** The key's code. */
  key: string
  /** The language that is empty. */
  lang: "ja" | "en"
  /** One line per line; `[words](address)` is a link. */
  text: string
}

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

/** The text of an entry as lines of spans. */
export function richTextOf(text: string): RichText {
  return text.split("\n").map((line): Line => {
    const spans: Line = []
    let at = 0
    for (const found of line.matchAll(LINK)) {
      if (found.index > at) spans.push({ text: line.slice(at, found.index) })
      spans.push({ text: found[1] ?? "", href: found[2] ?? "" })
      at = found.index + found[0].length
    }
    if (at < line.length || spans.length === 0) spans.push({ text: line.slice(at) })
    return spans
  })
}

const isEmpty = (side: TranslatedRichText["ja"]) => side.state === "value" && side.value.every((line) => line.every((span) => span.text.trim() === ""))

/** A dataset of one research with its entries filled in, adding each entry that found its value to `applied`. */
export function fillTranslations(
  dataset: DatasetContent,
  where: { hum: string, label: string },
  entries: readonly Translation[],
  keyIdOf: (code: string) => string | undefined,
  applied: Set<Translation>,
): DatasetContent {
  const own = entries.filter((entry) => entry.hum === where.hum && entry.dataset === where.label)
  if (own.length === 0) return dataset
  const filled = (slots: ValueSlot[], experiment: string | null): ValueSlot[] => slots.map((slot) => {
    const value = slot.value
    if (value.kind !== "text") return slot
    const entry = own.find((one) => one.experiment === experiment && keyIdOf(one.key) === slot.keyId)
    if (entry === undefined) return slot
    const other = entry.lang === "ja" ? value.text.en : value.text.ja
    if (!isEmpty(value.text[entry.lang]) || other.state !== "value" || isEmpty(other)) return slot
    applied.add(entry)
    return { ...slot, value: { ...value, text: { ...value.text, [entry.lang]: { state: "value", value: richTextOf(entry.text) } } } }
  })
  return {
    ...dataset,
    values: filled(dataset.values, null),
    experiments: dataset.experiments.map((experiment) => ({ ...experiment, values: filled(experiment.values, experiment.id) })),
  }
}

/**
 * The other language of a value of a research's own content, found by what
 * the words of the written language: a grant's title, a release note, a lab's name.
 * **Every value of the research whose one language is exactly `from` and
 * whose other language is empty is filled**, in every version and draft, so
 * one entry does for the same title written in several places.
 */
export interface ResearchTranslation {
  hum: string
  /** The language that is empty. */
  lang: "ja" | "en"
  /** The other language's words, as stored. */
  from: string
  /** One line per line; `[words](address)` is a link. */
  text: string
}

const STATES = new Set(["value", "unknown", "not-applicable"])

function isSlot(node: unknown): node is { state: string, value?: unknown } {
  return typeof node === "object" && node !== null && !Array.isArray(node) && STATES.has((node as { state?: unknown }).state as string)
}

/** The words of a string or prose slot holding a value, or null. */
function wordsOf(slot: { state: string, value?: unknown }): string | null {
  if (slot.state !== "value") return null
  if (typeof slot.value === "string") return slot.value
  if (!Array.isArray(slot.value) || !slot.value.every((line) => Array.isArray(line))) return null
  const lines = slot.value as unknown[][]
  if (!lines.every((line) => line.every((span) => typeof (span as { text?: unknown }).text === "string"))) return null
  return (lines as { text: string }[][]).map((line) => line.map((span) => span.text).join("")).join("\n")
}

/** A research's content with its entries filled in, adding each entry that found a value to `applied`. */
export function fillResearchTranslations<T>(content: T, hum: string, entries: readonly ResearchTranslation[], applied: Set<ResearchTranslation>): T {
  const own = entries.filter((entry) => entry.hum === hum)
  if (own.length === 0) return content
  const walk = (node: unknown, key: string | null): unknown => {
    // A dataset's values are filled by dataset (`fillTranslations`).
    if (key === "datasets") return node
    if (Array.isArray(node)) return node.map((item) => walk(item, null))
    if (typeof node !== "object" || node === null) return node
    const record = node as Record<string, unknown>
    if (isSlot(record.ja) && isSlot(record.en)) {
      for (const lang of ["ja", "en"] as const) {
        const other = wordsOf(lang === "ja" ? record.en : record.ja)
        const empty = wordsOf(record[lang] as { state: string })
        if (other === null || empty?.trim() !== "") continue
        const entry = own.find((one) => one.lang === lang && one.from === other)
        if (entry === undefined) continue
        applied.add(entry)
        const written = typeof (record[lang] as { value?: unknown }).value === "string" ? entry.text : richTextOf(entry.text)
        return { ...record, [lang]: { state: "value", value: written } }
      }
      return node
    }
    return Object.fromEntries(Object.entries(record).map(([name, value]) => [name, walk(value, name)]))
  }
  return walk(content, null) as T
}

/** Stops the load if an entry found no value to fill. */
export function assertTranslationsApplied(
  entries: readonly Translation[],
  applied: ReadonlySet<Translation>,
  research: readonly ResearchTranslation[] = [],
  researchApplied: ReadonlySet<ResearchTranslation> = new Set(),
): void {
  const unlanded = [
    ...entries.filter((entry) => !applied.has(entry)).map((entry) => `${entry.hum} ${entry.dataset} ${entry.experiment ?? "(dataset)"} ${entry.key} ${entry.lang}`),
    ...research.filter((entry) => !researchApplied.has(entry)).map((entry) => `${entry.hum} ${entry.lang} ${JSON.stringify(entry.from.slice(0, 60))}`),
  ]
  if (unlanded.length > 0) throw new Error(`translations that found no value to fill:\n${unlanded.join("\n")}`)
}
