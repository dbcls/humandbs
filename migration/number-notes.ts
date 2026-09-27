/**
 * Number notes that repeat a typed value of the same experiment.
 *
 * v1 wrote a variant count as `495,887 SNPs(hg19)` and a read length as
 * `150 bp x 2`, and the reading keeps the words beside a number as its note
 * (`numbers.ts`). The experiment holds the same facts as terms — the reference
 * genome, the read type — and the page shows both, one under the other. **The
 * note gives way only where the term holds the same fact.** Where the
 * experiment has no term, or one that disagrees with the note, the note is the
 * only place the fact is written and stays as it is.
 *
 * What is left of a note once the genome is taken out stays: `約 hg19` keeps
 * `約`, `男性 hg19` keeps `男性`.
 *
 * A note that is the sign written before the number (`>45×` read as `45 x`
 * and `>`) is put into words the same way here (`withoutSign`).
 */

import type { Bilingual, ContentValue, DatasetContent, NumberValue } from "~/content/types"

/** A reference genome as the notes spell it, and the term it is the same as. */
const GENOMES: readonly (readonly [RegExp, string])[] = [
  [/^(?:GRCh37(?:\.p\d+)?|hg19|hs37d5)$/i, "grch37"],
  [/^(?:GRCh38(?:\.p\d+)?|hg38)$/i, "grch38"],
  [/^(?:NCBI36|GRCh36|hg18|NCBI Build 36(?:\.\d+)?)$/i, "ncbi36"],
]

const NAME = String.raw`(?:GRCh3[678](?:\.p\d+)?|hg1[89]|hg38|hs37d5|NCBI36|NCBI Build 36(?:\.\d+)?)`
const NAMES = String.raw`${NAME}(?:\s*/\s*${NAME})*`
/** `ref:` and the like, which mean nothing once the genome is gone. */
const PREFIX = String.raw`(?:\b(?:ref(?:erence)?(?:\s+sequence)?)\s*[:：]?\s*)?`
/**
 * A genome as a note writes it: bare, after `ref:`, or in brackets of its own
 * (`（hg18）`, `reference [hg19]`). A bracket is taken only with its partner,
 * so `[txt、ref: hg19]` loses the genome and keeps the bracket around `txt`.
 */
const WRITTEN = new RegExp(
  [
    String.raw`\[\s*${PREFIX}${NAMES}\s*\]`,
    String.raw`［\s*${PREFIX}${NAMES}\s*］`,
    String.raw`\(\s*${PREFIX}${NAMES}\s*\)`,
    String.raw`（\s*${PREFIX}${NAMES}\s*）`,
    String.raw`${PREFIX}(?:\[\s*${NAMES}\s*\]|\(\s*${NAMES}\s*\)|${NAMES})`,
  ].join("|"),
  "gi",
)

/** The genome terms a note names, or null where one of its names is no genome this knows. */
function genomesIn(note: string): string[] {
  const codes: string[] = []
  for (const found of note.matchAll(new RegExp(NAME, "gi"))) {
    const code = GENOMES.find(([spelled]) => spelled.test(found[0]))?.[1]
    if (code !== undefined) codes.push(code)
  }
  return codes
}

function tidied(said: string): string {
  return said
    .replace(/\[\s*\]|［\s*］|\(\s*\)|（\s*）/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s、,;:：]+|[\s、,;:：]+$/g, "")
}

/** `x 2`, `2 ×`, `ペアエンド(x2)`: the two reads of a pair, which the read type already records. */
const READ_TWICE = /^(?:x\s*2|2\s*[x×]|×\s*2|(?:ペアエンド|paired-end)\s*[(（]\s*x\s*2\s*[)）])$/i

export interface NoteLookup {
  /** `content_key.id` of each key the rules read or write, by code. */
  keyIdOf: (code: string) => string | undefined
  /** The code of a term of the given vocabulary, by the term's identity. */
  termCodeOf: (setCode: string, termId: string) => string | undefined
}

export interface NoteChange {
  experiment: string
  key: string
  before: Pick<NumberValue, "label" | "note">
  after: Pick<NumberValue, "label" | "note">
}

/** Keys whose notes name the reference genome a count was taken against. */
const COUNTED_AGAINST_GENOME = new Set(["variant-number", "probe-number"])

/** Every number key, for the rule that reads any of them (`withoutSign`). */
const NUMBER_KEYS = [
  "subject-count", "read-length", "coverage-depth", "coverage-breadth", "variant-number",
  "probe-number", "gene-number", "peak-number", "total-data-volume",
] as const

function termCodes(values: DatasetContent["experiments"][number]["values"], keyId: string | undefined, setCode: string, lookup: NoteLookup): Set<string> {
  const slot = values.find((one) => one.keyId === keyId)?.value
  if (slot?.kind !== "vocabulary" || slot.termIds.state !== "value") return new Set()
  return new Set(slot.termIds.value.flatMap((id) => lookup.termCodeOf(setCode, id) ?? []))
}

function withoutGenome(note: Bilingual, genomes: ReadonlySet<string>): Bilingual | null | undefined {
  const named = [...genomesIn(note.ja), ...genomesIn(note.en)]
  if (named.length === 0 || named.some((code) => !genomes.has(code))) return undefined
  const ja = tidied(note.ja.replace(WRITTEN, " "))
  const en = tidied(note.en.replace(WRITTEN, " "))
  return ja === "" && en === "" ? null : { ja, en }
}

function withoutReadTwice(note: Bilingual, readTypes: ReadonlySet<string>): null | undefined {
  if (!readTypes.has("paired-end")) return undefined
  const sides = [note.ja.trim(), note.en.trim()].filter((side) => side !== "")
  return sides.length > 0 && sides.every((side) => READ_TWICE.test(side)) ? null : undefined
}

/** A note that ends in the sign written before the number (`>90%` read as `90 %` and `>`). */
const SIGNED = /^(.*?)\s*([>＞≥≧])$/

const SIGN_WORDS: Readonly<Record<string, Bilingual>> = {
  ">": { ja: "超", en: "More than" },
  "≥": { ja: "以上", en: "Or more" },
}

/**
 * The sign put into words, so that `45 x (>)` reads `45 x (超)`. **What the
 * note said before the sign becomes the label** (`Uniquely mapped reads >` over
 * `90 %`), where the number has none; where it has one the note is left as it
 * is rather than one of the two being lost.
 */
function withoutSign(one: Pick<NumberValue, "label" | "note">): Pick<NumberValue, "label" | "note"> | undefined {
  if (one.note === null) return undefined
  const sides = [one.note.ja.trim(), one.note.en.trim()]
  const read = sides.map((side) => (side === "" ? null : SIGNED.exec(side)))
  if (read.some((found, at) => found === null && sides[at] !== "") || read.every((found) => found === null)) return undefined
  const signs = new Set(read.flatMap((found) => (found === null ? [] : [(found[2] ?? "").replace("＞", ">").replace("≧", "≥")])))
  const sign = signs.size === 1 ? SIGN_WORDS[[...signs][0] ?? ""] : undefined
  if (sign === undefined) return undefined
  const [ja = "", en = ""] = read.map((found) => found?.[1]?.trim() ?? "")
  if (ja === "" && en === "") return { label: one.label, note: sign }
  if (one.label !== null) return undefined
  return { label: { ja, en }, note: sign }
}

/**
 * A description with the notes that repeat a term taken out and the signs put
 * into words, and what changed. The number itself and its unit are never touched.
 */
export function withoutRepeatedNotes<T extends Pick<DatasetContent, "experiments">>(
  content: T,
  lookup: NoteLookup,
): { content: T, changes: NoteChange[] } {
  const changes: NoteChange[] = []
  const referenceKey = lookup.keyIdOf("reference-sequence")
  const readTypeKey = lookup.keyIdOf("read-type")
  const codeOfKey = new Map(NUMBER_KEYS.flatMap((code) => {
    const keyId = lookup.keyIdOf(code)
    return keyId === undefined ? [] : [[keyId, code] as const]
  }))

  const experiments = content.experiments.map((experiment) => {
    const genomes = termCodes(experiment.values, referenceKey, "reference-sequence", lookup)
    const readTypes = termCodes(experiment.values, readTypeKey, "read-type", lookup)
    const unchanged = changes.length
    const values = experiment.values.map((slot) => {
      const value: ContentValue = slot.value
      if (value.kind !== "number" || value.values.state !== "value") return slot
      const key = codeOfKey.get(slot.keyId)
      if (key === undefined) return slot
      const before = changes.length
      const numbers = value.values.value.map((one): NumberValue => {
        if (one.note === null) return one
        const repeated = key === "read-length"
          ? withoutReadTwice(one.note, readTypes)
          : (COUNTED_AGAINST_GENOME.has(key) ? withoutGenome(one.note, genomes) : undefined)
        const settled = repeated === undefined ? one : { ...one, note: repeated }
        const worded = withoutSign(settled) ?? settled
        if (worded.label === one.label && worded.note === one.note) return one
        changes.push({ experiment: experiment.id, key, before: { label: one.label, note: one.note }, after: { label: worded.label, note: worded.note } })
        return { ...one, label: worded.label, note: worded.note }
      })
      if (changes.length === before) return slot
      return { ...slot, value: { ...value, values: { state: "value" as const, value: numbers } } }
    })
    return changes.length === unchanged ? experiment : { ...experiment, values }
  })
  return { content: changes.length === 0 ? content : { ...content, experiments }, changes }
}
