import type { Locale } from "~/i18n/locale"
import type { DiseaseView, FieldView, ValueView } from "~/public/view.server"

/**
 * The keys an experiment's page draws as chips, under the key whose paragraph
 * they were read out of.
 *
 * **Only short classifications already written in the paragraph.** Typing a
 * value for the listing's filters wrote the same fact twice,
 * "末梢血から抽出したDNA" and "末梢血", and two rows of it read as two facts.
 * Under the paragraph, with its name, a chip reads as a word about it.
 *
 * **A key with what is not written in the paragraph, or running long, stays a
 * row**: a disease with its ICD-10 codes, a cell line's own name, what was
 * measured and on what, and the numbers with their labels. Those are what a
 * reader comes looking for.
 */
export const CHIPS_UNDER: ReadonlyMap<string, readonly string[]> = new Map([
  ["materials-and-participants", ["health-status", "subject-count", "subject-count-type", "cohort", "population", "sex", "age-group"]],
  ["sample-description", ["tissue", "is-tumor"]],
])

/** The count, and the key saying what it counts, which is drawn after it in one chip (`96 (人数)`). */
const COUNT = "subject-count"
const COUNTED_AS = "subject-count-type"

export interface ExperimentChip {
  value: ValueView
  /** What the count counts, drawn after it. */
  countedAs?: ValueView
}

/** A key a row is headed by: its identity, for the row's place, and its name. */
export interface KeyHeading {
  keyId: string
  label: string
}

export interface ExperimentRow {
  keyId: string
  label: string
  /** Null for a paragraph that is not written: the row is its name with the classifications under it. */
  value: ValueView | null
  /** The classifications drawn under this row's paragraph. */
  chips: ExperimentChip[]
}

const underOf = new Map([...CHIPS_UNDER].flatMap(([under, codes]) => codes.map((code) => [code, under] as const)))

/**
 * An experiment's values as its page draws them, in the order they come: a row
 * each, with the classifications gathered under their paragraph.
 *
 * **A classification whose paragraph is not written is still a chip**, under a
 * row of the paragraph's name alone (`headings`), placed where the first of
 * them comes. The chips read the same whether or not the paragraph was written,
 * and a row of the paragraph's name keeps them from being taken for the value
 * above. Where the catalog does not name the paragraph, each stays a row.
 */
export function experimentRows(
  values: readonly ValueView[],
  headings: Readonly<Record<string, KeyHeading>>,
): ExperimentRow[] {
  const present = new Set(values.map((one) => one.code))
  const byCode = new Map(values.map((one) => [one.code, one]))
  const headingOf = (code: string): KeyHeading | undefined => headings[code]
  const underHeading = (one: ValueView): string | undefined => {
    const under = underOf.get(one.code)
    return under !== undefined && (present.has(under) || headingOf(under) !== undefined) ? under : undefined
  }
  const chipsUnder = (code: string): ExperimentChip[] => values
    .filter((one) => underOf.get(one.code) === code)
    .flatMap((one): ExperimentChip[] => {
      if (one.code === COUNTED_AS && present.has(COUNT)) return []
      const countedAs = one.code === COUNT ? byCode.get(COUNTED_AS) : undefined
      return [countedAs === undefined ? { value: one } : { value: one, countedAs }]
    })

  const headed = new Set<string>()
  return values.flatMap((one): ExperimentRow[] => {
    const under = underHeading(one)
    if (under === undefined) {
      return [{ keyId: one.keyId, label: one.label, value: one, chips: CHIPS_UNDER.has(one.code) ? chipsUnder(one.code) : [] }]
    }
    const heading = headingOf(under)
    if (present.has(under) || headed.has(under) || heading === undefined) return []
    headed.add(under)
    return [{ ...heading, value: null, chips: chipsUnder(under) }]
  })
}

/** What a chip joins its values with, in the page's language. */
export const CHIP_SEPARATOR: Record<Locale, string> = { ja: "、", en: ", " }

/**
 * A disease as one line of text, where a page's chip cannot be drawn — a
 * comparison of two versions, the text a value is read as: its name, and its
 * chip's entries in brackets after it.
 */
export function diseaseLine(disease: DiseaseView): string {
  const codes = disease.spans.join(", ")
  if (disease.name === null) return codes
  return codes === "" ? disease.name : `${disease.name} (${codes})`
}

/**
 * A value as a chip draws it: the values a row draws a line each, run together
 * on one line with the page's list separator. A chip is one line of words about
 * the paragraph above it, and a tissue with nine values would otherwise take
 * nine lines under it.
 */
export function onOneLine(field: FieldView, locale: Locale): FieldView {
  if (field.state !== "rich" || field.text.length <= 1) return field
  return {
    ...field,
    text: [field.text.flatMap((line, at) => at === 0 ? line : [{ text: CHIP_SEPARATOR[locale] }, ...line])],
  }
}
