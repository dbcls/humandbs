/**
 * The numbers as the migration reads them, and the shape they are stored in.
 *
 * **The source writes a number with a label and a note**, and every step that
 * reads the source's cells — splitting them per dataset, moving a sign out of a
 * note, taking an id off the end of a label — works on those two. The portal
 * stores what is written before and after the number instead (`prefix` and
 * `suffix` in `app/content/types.ts`), so the migration keeps the source's
 * shape until it writes a row, and converts each number there.
 *
 * **The conversion keeps what the page shows.** A label `常染色体` becomes the prefix
 * `常染色体: `, and a note `以上` the suffix ` (以上)` — the same words the page
 * put around the number when it held a label and a note. A key that counts has
 * no unit: the word the source wrote after a count (`SNVs`) goes into the
 * suffix, in front of the note.
 *
 * `drizzle/0010_number_prefix_suffix.sql` converts what is already stored by
 * the same rule.
 */

import { and, eq, isNull } from "drizzle-orm"

import type {
  Bilingual,
  ContentValue,
  DatasetContent,
  Experiment,
  NumberValue,
  PublishedDataset,
  ValueSlot,
  VersionContent,
} from "~/content/types"
import type { Executor } from "~/db/client.server"
import { contentKey } from "~/db/schema"

/** A number as the source wrote it: which one it is, and what qualifies it. */
export interface SourceNumber extends Omit<NumberValue, "prefix" | "suffix"> {
  label: Bilingual | null
  note: Bilingual | null
}

export type SourceContentValue = ContentValue<SourceNumber>
export type SourceValueSlot = ValueSlot<SourceNumber>
export type SourceExperiment = Experiment<SourceNumber>
export type SourceDatasetContent = DatasetContent<SourceNumber>
export type SourcePublishedDataset = PublishedDataset<SourceNumber>
export type SourceVersionContent = VersionContent<SourceNumber>

/**
 * The English for the words the source wrote after a count in Japanese. The
 * source had one word for both pages, so the English page showed these.
 */
const ENGLISH_COUNT_WORDS: Readonly<Record<string, string>> = {
  プローブ: "probes",
  遺伝子: "genes",
  バリアント: "variants",
}

/** A unit that closes up against its number (`30x`, `98%`), as the page draws it (`view.server.ts`). */
const CLOSE_UNIT = /^[x×%倍]$/i

function pairOrNull(pair: Bilingual): Bilingual | null {
  return pair.ja === "" && pair.en === "" ? null : pair
}

/**
 * One number in the portal's shape. `counts` is whether its key has no
 * canonical unit, whose "unit" the source used for the word after the count.
 */
export function prefixedNumber(read: SourceNumber, counts: boolean): NumberValue {
  const { label, note, ...number } = read
  const word = counts ? read.inputUnit : null
  const wordIn = (language: "ja" | "en"): string => {
    if (word === null) return ""
    const written = language === "en" ? ENGLISH_COUNT_WORDS[word] ?? word : word
    return CLOSE_UNIT.test(written) ? written : ` ${written}`
  }
  const noteIn = (language: "ja" | "en"): string => {
    const side = note?.[language] ?? ""
    return side === "" ? "" : ` (${side})`
  }
  const labelIn = (language: "ja" | "en"): string => {
    const side = label?.[language] ?? ""
    return side === "" ? "" : `${side}: `
  }
  return {
    ...number,
    prefix: pairOrNull({ ja: labelIn("ja"), en: labelIn("en") }),
    unit: counts ? null : read.unit,
    inputUnit: counts ? null : read.inputUnit,
    suffix: pairOrNull({ ja: wordIn("ja") + noteIn("ja"), en: wordIn("en") + noteIn("en") }),
  }
}

function prefixedValue(value: SourceContentValue, counts: boolean): ContentValue {
  if (value.kind !== "number") return value
  if (value.values.state !== "value") return { kind: "number", values: value.values }
  return {
    kind: "number",
    values: { state: "value", value: value.values.value.map((one) => prefixedNumber(one, counts)) },
  }
}

function prefixedSlots(slots: readonly SourceValueSlot[], counting: ReadonlySet<string>): ValueSlot[] {
  return slots.map((slot) => ({ keyId: slot.keyId, value: prefixedValue(slot.value, counting.has(slot.keyId)) }))
}

/** A dataset's content with its numbers in the portal's shape. `counting` holds the keys that count. */
export function prefixedDataset<T extends SourceDatasetContent>(
  content: T,
  counting: ReadonlySet<string>,
): Omit<T, "values" | "experiments"> & DatasetContent {
  return {
    ...content,
    values: prefixedSlots(content.values, counting),
    experiments: content.experiments.map((experiment) => ({
      ...experiment,
      values: prefixedSlots(experiment.values, counting),
    })),
  }
}

/** A version's content with every dataset's numbers in the portal's shape. */
export function prefixedVersion(content: SourceVersionContent, counting: ReadonlySet<string>): VersionContent {
  return { ...content, datasets: content.datasets.map((dataset) => prefixedDataset(dataset, counting)) }
}

/** The number keys that count, which have no canonical unit: the ones whose "unit" the source used for a word. */
export async function countingKeys(db: Executor): Promise<Set<string>> {
  const rows = await db
    .select({ id: contentKey.id })
    .from(contentKey)
    .where(and(eq(contentKey.valueType, "number"), isNull(contentKey.canonicalUnit)))
  return new Set(rows.map((row) => row.id))
}
