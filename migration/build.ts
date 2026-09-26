/**
 * Turning v1 documents into v2 content.
 *
 * Everything here is a pure function of the dump plus the identities already
 * inserted, so the same input produces byte-identical content on every run and
 * two runs can be diffed against each other.
 *
 * Three shape changes happen here and nowhere else:
 *
 * - **Every field is present, in both languages.** v1 dropped a key when it had
 *   no value, so a missing value arrives as an absent key. It becomes an empty
 *   value rather than `unknown`: `unknown` means "there is a value but it is
 *   not settled", and published v1 content has essentially none of those
 *   (2 leaves), so asserting it here would invent a state the data does not
 *   have.
 * - **Fields v2 holds as one language become one.** Publication titles and
 *   experiment labels are single-valued in v2; the language that has the
 *   value wins, and where both do they agree in 94% or more of the data.
 * - **References become identities.** A dataset is addressed by its uuid, not
 *   by the `JGAD…` string, which is a label that can be corrected.
 * - **Prose stops being markdown** (`richtext.ts`).
 */

import { isPortalIssuedId } from "~/admin/labels"
import { isEmptyRichText } from "~/content/richtext"
import { convert } from "~/content/units"
import { countryName } from "~/upstream/country"
import type {
  DataProvider,
  DatasetContent,
  Experiment,
  Grant,
  Link,
  LocalizedLinks,
  NumberValue,
  RelatedPublication,
  ResearchContent,
  ResearchProject,
  RichText,
  Slot,
  TranslatedRichText,
  TranslatedText,
  ValueSlot,
} from "~/content/types"

import { ACCESS_CRITERIA_SET, accessCriteriaTermCode } from "./catalog"
import type {
  EsBilingual,
  EsBilingualRich,
  EsControlledAccessUser,
  EsExperiment,
  EsLink,
  EsResearchVersion,
  EsRichText,
  EsSummaryShort,
  PublishedDataset,
} from "./es"
import { DASH } from "./dashes"
import {
  DISEASE_SOURCE,
  type DiseaseText,
  facetValueSlots,
  MERGED_READERS,
  NUMBER_FACETS,
  NUMBER_SPLITS,
  RETYPED_CODES,
  TEXT_NUMBERS,
  type TextNumberKey,
  VOCABULARY_FACETS,
} from "./facets"
import { readCell, storedNumber, withHandReadings, type LabelTranslations, type ReadNumber } from "./numbers"
import { richTextFromMarkdown, richTextFromPlain } from "./richtext"

function held<T>(value: T): Slot<T> {
  return { state: "value", value }
}

/**
 * A cell the article filled with a dash: the row did not apply to the
 * experiment (`dashes.ts`). A dash in one language is that language's; a
 * number or a term has no language, so a dash in either language is enough.
 */
function isDashCell(value: EsBilingualRich | null | undefined): boolean {
  const ja = value?.ja?.text ?? ""
  const en = value?.en?.text ?? ""
  return (DASH.test(ja) || DASH.test(en)) && [ja, en].every((text) => text.trim() === "" || DASH.test(text))
}

/**
 * How one language of a v1 rich value becomes prose. The default reads v1's
 * extracted text, which is markdown, and leaves the HTML it came from behind;
 * a load that recovers what the extraction lost passes its own.
 */
export type ProseReader = (value: EsRichText | null | undefined, lang: "ja" | "en") => RichText

export const proseFromText: ProseReader = (value) => richTextFromMarkdown(value?.text ?? "")

function prose(value: EsBilingualRich | null | undefined, read: ProseReader): TranslatedRichText {
  return {
    ja: held(read(value?.ja, "ja")),
    en: held(read(value?.en, "en")),
  }
}

/**
 * How one language of a v1 value v2 holds as a single line becomes the line.
 * The default keeps v1's text; a load that has the pages v1 read it from
 * passes its own.
 */
export type TextReader = (value: string, lang: "ja" | "en") => string

const textAsV1Wrote: TextReader = (value) => value

/** A v1 rich field that v2 holds as a value, which is its text without markup. */
function valueText(value: EsBilingualRich | null | undefined, read: TextReader): TranslatedText {
  return { ja: held(read(value?.ja?.text ?? "", "ja")), en: held(read(value?.en?.text ?? "", "en")) }
}

function plainText(value: EsBilingual | null | undefined, read: TextReader = textAsV1Wrote): TranslatedText {
  return { ja: held(read(value?.ja ?? "", "ja")), en: held(read(value?.en ?? "", "en")) }
}

/** The language that has a value wins; when both do they agree in the data. */
function single(...candidates: (string | null | undefined)[]): Slot<string> {
  return held(candidates.find((c) => c) ?? "")
}

/** A link with no destination is dropped: v1 stored the text of one anyway. */
function linkList(links: (EsLink | null | undefined)[], prefix: string): Link[] {
  return links.flatMap((link, index) => {
    const url = link?.url
    if (!url) return []
    return [{ id: `${prefix}-${index + 1}`, url, text: link.text ?? url }]
  })
}

function localizedLinks(
  ja: (EsLink | null | undefined)[],
  en: (EsLink | null | undefined)[],
  prefix: string,
): LocalizedLinks {
  return { ja: held(linkList(ja, `${prefix}-ja`)), en: held(linkList(en, `${prefix}-en`)) }
}

/** Drops references to datasets that no published version lists. */
function datasetIdentities(labels: string[], datasetIdByLabel: Map<string, string>): string[] {
  return labels.map((l) => datasetIdByLabel.get(l)).filter((id) => id !== undefined)
}

/**
 * A cited ID as the portal writes it. **JGA's long form is folded to its six
 * digits** (`JGAD00000000222` is `JGAD000222`): v1 has both spellings, and
 * only the short one is in the `label_pin` table.
 */
export function citedLabel(label: string): string {
  const long = /^(JGA[DS])0{5}(\d{6})$/.exec(label)
  return long === null ? label : `${long[1] ?? ""}${long[2] ?? ""}`
}

/**
 * Whether a cited ID has the shape of an accession — letters, then digits,
 * with a hyphen between allowed — and is not a placeholder of all zeros
 * (`JGAD000000`), which v1 writes where the ID was not known yet.
 */
export function isAccessionShaped(label: string): boolean {
  const digits = /^[A-Z]+(?:-[A-Z]+)*-?(\d+)$/.exec(label)?.[1]
  return digits !== undefined && /[1-9]/.test(digits)
}

/**
 * The datasets one publication cites, split the way the content holds them:
 * this research's own by identity, anything else by the ID as written.
 * A placeholder is dropped.
 */
function publicationDatasets(
  labels: string[],
  datasetIdByLabel: Map<string, string>,
  own: (label: string) => boolean,
): { datasetIds: Slot<string[]>, externalIds: string[] } {
  const datasetIds: string[] = []
  const externalIds: string[] = []
  for (const written of labels) {
    const label = citedLabel(written)
    const identity = datasetIdByLabel.get(label)
    if (identity !== undefined && own(label)) {
      if (!datasetIds.includes(identity)) datasetIds.push(identity)
    } else if (isAccessionShaped(label) && !externalIds.includes(label)) {
      externalIds.push(label)
    }
  }
  return { datasetIds: held(datasetIds), externalIds }
}

export interface ResearchContentInput {
  version: EsResearchVersion
  /**
   * v1 keeps the short summary on the research rather than on a version, so it
   * describes the current state of the research. It goes on the version that is
   * current and nowhere else — copying it onto older versions would state that
   * a past version said something it never said.
   */
  listingSummary: EsSummaryShort | null
  datasetIdByLabel: Map<string, string>
  /**
   * The research each dataset belongs to, by label: a publication's citation
   * of another research's dataset is kept as the ID, not the identity. Absent,
   * every dataset in `datasetIdByLabel` counts as this research's.
   */
  humOfLabel?: ReadonlyMap<string, string>
  readProse?: ProseReader
  /** The reader of the listing summary, which the old portal wrote on the listing rather than on the research's page. */
  readListing?: ProseReader
  /** The reader of the values held as a single line: providers, projects, grants and publication titles. */
  readText?: TextReader
}

export function buildResearchContent(input: ResearchContentInput): ResearchContent {
  const { version: rv, listingSummary, datasetIdByLabel, humOfLabel } = input
  const read = input.readProse ?? proseFromText
  const readListing = input.readListing ?? read
  const readText = input.readText ?? textAsV1Wrote
  const own = (label: string): boolean => humOfLabel === undefined || humOfLabel.get(label) === rv.humId

  const dataProviders: DataProvider[] = (rv.dataProvider ?? []).map((p, i) => ({
    id: `data-provider-${i + 1}`,
    name: valueText(p.name, readText),
    organization: {
      name: valueText(p.organization?.name, readText),
    },
  }))

  const researchProjects: ResearchProject[] = (rv.researchProject ?? []).map((p, i) => ({
    id: `research-project-${i + 1}`,
    name: valueText(p.name, readText),
    url: localizedLinks([p.url?.ja], [p.url?.en], `research-project-${i + 1}-url`),
  }))

  const grants: Grant[] = (rv.grant ?? []).map((g, i) => ({
    id: `grant-${i + 1}`,
    title: plainText(g.title, readText),
    agency: { name: plainText(g.agency?.name, readText) },
    grantIds: held(g.id ?? []),
  }))

  const relatedPublications: RelatedPublication[] = (rv.relatedPublication ?? []).map((p, i) => ({
    id: `publication-${i + 1}`,
    title: single(p.title?.en && readText(p.title.en, "en"), p.title?.ja && readText(p.title.ja, "ja")),
    doi: single(p.doi),
    ...publicationDatasets(p.datasetIds ?? [], datasetIdByLabel, own),
  }))

  return {
    title: plainText(rv.title),
    summary: {
      aims: prose(rv.summary?.aims, read),
      methods: prose(rv.summary?.methods, read),
      targets: prose(rv.summary?.targets, read),
      url: localizedLinks(rv.summary?.url?.ja ?? [], rv.summary?.url?.en ?? [], "summary-url"),
    },
    listingSummary: {
      methods: prose(listingSummary?.methods, readListing),
      targets: prose(listingSummary?.targets, readListing),
      typeOfData: prose(listingSummary?.typeOfData, readListing),
      // Empty, which is what makes the listing read the research's own
      // providers. v1 draws the column from the same names, so a table built
      // this way shows what v1's shows; a copy taken here would instead be a
      // second set of names that no one had chosen and that would not follow a
      // correction made to the first.
      dataProviders: [],
    },
    releaseNote: prose(rv.releaseNote, read),
    dataProviders,
    researchProjects,
    grants,
    relatedPublications,
    datasetIds: datasetIdentities((rv.datasets ?? []).map((d) => d.datasetId), datasetIdByLabel),
  }
}

/**
 * The lines of a cell that are about a different dataset.
 *
 * **A v1 cell is sometimes a table about several datasets at once.** Where a
 * research holds five datasets, the same five-row table of data volumes is
 * copied into all five, each row labelled with the accession it is about. The
 * label is not "which part of this dataset" — it identifies another dataset
 * entirely, and it is the only thing indicating which row belongs to whom. Measured
 * over the dump: 18,272 labelled lines, of which **94.9% name a sibling rather
 * than the dataset whose cell they sit in**.
 *
 * Left as they are, every one of those values is stored in as many places as the
 * research has datasets, and an editor correcting one has to find the rest.
 *
 * **A line is dropped only where the dataset it identifies has the same line
 * itself.** That is what makes this lossless rather than a guess: 34,797 of the
 * 34,842 borrowed lines are word-for-word present on the dataset they are
 * about. The 45 that are not — 15 naming a dataset with no line of its own, 30
 * disagreeing with what that dataset has — stay where they are. Something has
 * to look at those, and quietly deleting them would be the one outcome that
 * cannot be reviewed.
 */
const LANGUAGES = ["ja", "en"] as const
type Language = (typeof LANGUAGES)[number]

const LINE_PART = "\u0000"

function lineKey(label: string, sourceKey: string, lang: Language, said: string): string {
  return [label, sourceKey, lang, said].join(LINE_PART)
}

/** What a line states, and the datasets its label names, if any. */
function readLine(line: string, labels: ReadonlySet<string>): {
  said: string
  about: string[]
} {
  const at = topLevelColon(line)
  if (at === -1) return { said: line.trim(), about: [] }
  const about = line.slice(0, at)
    .split(/[、,/／・]|および/)
    .map((part) => part.replace(/[（(][^)）]*[)）]/g, "").trim())
    .filter((part) => labels.has(part))
  return { said: line.slice(at + 1).trim(), about }
}

/**
 * The first colon outside any bracket. A value has colons of its
 * own — `bam [ref: hg19]` — and splitting on the first one anywhere would read
 * those as labels.
 */
function topLevelColon(line: string): number {
  let depth = 0
  for (let at = 0; at < line.length; at += 1) {
    const ch = line[at] ?? ""
    if ("([（［".includes(ch)) depth += 1
    else if (")]）］".includes(ch)) depth = Math.max(0, depth - 1)
    else if ((ch === ":" || ch === "：") && depth === 0) return at
  }
  return -1
}

/** The lines of a value as the reader sees them, as plain strings. */
function plainLines(value: EsRichText | null | undefined, lang: Language, read: ProseReader | undefined): string[] {
  if (read === undefined) return (value?.text ?? "").split("\n")
  return read(value, lang).map((line) => line.map((span) => span.text).join(""))
}

/**
 * Every line each dataset states about itself, which is what makes a copy a copy.
 * Given the reader the load builds prose with, the lines are the ones it reads;
 * `readFor` gives a dataset a reader of its own, as the load does.
 */
export function ownLines(
  datasets: readonly PublishedDataset[],
  read?: ProseReader,
  readFor?: (dataset: PublishedDataset) => ProseReader,
): ReadonlySet<string> {
  const labels = new Set(datasets.map((one) => one.label))
  const keys = new Set<string>()
  for (const one of datasets) {
    const reader = readFor?.(one) ?? read
    for (const experiment of one.doc.experiments ?? []) {
      for (const [sourceKey, value] of Object.entries(experiment.data ?? {})) {
        for (const lang of LANGUAGES) {
          for (const line of plainLines(value[lang], lang, reader)) {
            const { said, about } = readLine(line, labels)
            if (about.includes(one.label)) keys.add(lineKey(one.label, sourceKey, lang, said))
          }
        }
      }
    }
  }
  return keys
}

export interface DatasetContentInput {
  dataset: PublishedDataset
  /** `content_key.code` to the identity it was inserted under. */
  keyIdByCode: Map<string, string>
  /** The v1 key string of an experiment value to a `content_key.code`. */
  codeBySourceKey: Map<string, string>
  /** `{set code}/{term code}` to identity. */
  termIdBySetAndCode: Map<string, string>
  /** The terms a code the reading mints goes to, where the vocabulary was settled by hand (`vocabulary-plan.ts`). */
  termIdsOf?: (setCode: string, code: string) => string[]
  /** Whether the ICD10 dictionary holds a code, which is what resolves one. */
  knownCode: (code: string) => boolean
  accessCriteriaKeyCode: string
  typeOfDataKeyCode: string
  /** Every dataset label in the dump, so a line's label can be recognised. */
  datasetLabels: ReadonlySet<string>
  /** What each dataset states about itself (`ownLines`). */
  ownLines: ReadonlySet<string>
  /**
   * Where the lines no rule could read are collected. **They are not dropped
   * quietly**: a cell that states something this cannot hold as a number is work
   * for somebody, and the list is what that work is done from.
   */
  unread: { dataset: string, sourceKey: string, line: string }[]
  /** The lines somebody read by hand (`numbers.ts` の `byHand`). */
  byHand: ReadonlyMap<string, ReadNumber[]>
  /**
   * Hand translations of a number's label or note (`numbers.ts` の
   * `labelTranslations`). Absent before anybody has translated one, which
   * leaves every label and note sorted by script alone (`bilingualOf`).
   */
  labelTranslations?: LabelTranslations
  /** The same reader `ownLines` was given, if any. */
  readProse?: ProseReader
  /** The type of data as rich text, from the plain string v1 stored. Absent, the string is read as it is (`richTextFromPlain`). */
  readTypeOfData?: (text: string, lang: Language) => RichText
}

/**
 * The caption the article's dataset table gives this dataset: the line above
 * the one with its link in `NBDC Dataset Accession` (`COPD` over
 * `hum0014.v17.COPD.v1`), in each language, or null where there is none.
 */
export function captionOf(experiment: EsExperiment, label: string): { ja: string | null, en: string | null } {
  const cell = experiment.data?.["NBDC Dataset Accession"]
  const find = (text: string): string | null => {
    const lines = text.split("\n")
    const at = lines.findIndex((line) => line.includes(label))
    const above = at > 0 ? (lines[at - 1] ?? "").trim() : ""
    return above === "" || /\]\(|https?:\/\//.test(above) ? null : above
  }
  return { ja: find(cell?.ja?.text ?? ""), en: find(cell?.en?.text ?? "") }
}

const comparableName = (name: string): string => name.replace(/[＊*\s]/g, "").toLowerCase()

/**
 * The disease values narrowed to the one the caption names. The materials of a
 * disease-by-disease table list every disease of the cohort, and each dataset
 * copied them; a dataset whose caption is one of those diseases is about that
 * disease alone. Where no disease has the caption's name, all of them stay.
 */
export function narrowedToCaption(slots: ValueSlot[], caption: { ja: string | null, en: string | null }): ValueSlot[] {
  if (caption.ja === null && caption.en === null) return slots
  return slots.map((slot) => {
    if (slot.value.kind !== "disease" || slot.value.diseases.state !== "value") return slot
    const named = slot.value.diseases.value.filter((one) =>
      (caption.ja !== null && one.nameJa !== null && comparableName(one.nameJa) === comparableName(caption.ja))
      || (caption.en !== null && one.nameEn !== null && comparableName(one.nameEn) === comparableName(caption.en)))
    if (named.length === 0) return slot
    return { ...slot, value: { kind: "disease", diseases: { state: "value", value: named } } }
  })
}

export function buildDatasetContent(input: DatasetContentInput): DatasetContent {
  const { dataset, keyIdByCode, codeBySourceKey, termIdBySetAndCode, knownCode } = input
  const doc = dataset.doc
  const translations = input.labelTranslations ?? new Map()

  /** Whether a line of a cell stays, or is about another dataset (`ownLines`). */
  const stays = (sourceKey: string, lang: Language, line: string): boolean => {
    const { said, about } = readLine(line, input.datasetLabels)
    if (about.length === 0 || about.includes(dataset.label)) return true
    // Only where every dataset it identifies has the same line itself. Anything
    // else is the one copy of that value, wherever it happens to sit.
    return !about.every((label) => input.ownLines.has(lineKey(label, sourceKey, lang, said)))
  }

  /** A cell with the lines about other datasets taken out. */
  const kept = (sourceKey: string, lang: Language, text: string): string => {
    const lines = text.split("\n")
    const staying = lines.filter((line) => stays(sourceKey, lang, line))
    return staying.length === lines.length ? text : staying.join("\n")
  }

  /** The same, for a cell read as prose by the load's reader. */
  const keptProse = (sourceKey: string, lang: Language, value: EsRichText | null | undefined): RichText => {
    if (input.readProse === undefined) return richTextFromMarkdown(kept(sourceKey, lang, value?.text ?? ""))
    const staying = input.readProse(value, lang)
      .filter((line) => stays(sourceKey, lang, line.map((span) => span.text).join("")))
    // A dropped line can leave two paragraph breaks side by side, or one at an
    // edge; neither means anything.
    const joined: RichText = []
    for (const line of staying) {
      if (line.length > 0 || (joined.at(-1)?.length ?? 0) > 0) joined.push(line)
    }
    if (joined.at(-1)?.length === 0) joined.pop()
    return joined
  }

  /**
   * The text an experiment's diseases are read from: the cell as the article
   * wrote it, where the load's reader finds it. It is the whole cell, lines
   * about other datasets included — the caption narrows the diseases afterwards
   * (`narrowedToCaption`).
   */
  const diseaseTextOf = (e: EsExperiment): DiseaseText | undefined => {
    const cell = e.data?.[DISEASE_SOURCE]
    if (input.readProse === undefined || cell === undefined) return undefined
    const plain = (rich: RichText) => rich.map((line) => line.map((span) => span.text).join("")).join("\n")
    return { ja: plain(input.readProse(cell.ja, "ja")), en: plain(input.readProse(cell.en, "en")) }
  }

  /**
   * The facets whose row the article filled with a dash (`dashes.ts`) and
   * which read no value out of anything else. **A facet is read from v1's
   * extracted layer**, not from the cell, so the cell's dash is the only record
   * that the key does not apply.
   */
  const dashedFacets = (e: EsExperiment, held: readonly ValueSlot[]): ValueSlot[] => {
    const slots: ValueSlot[] = []
    for (const [sourceKey, value] of Object.entries(e.data ?? {})) {
      const code = codeBySourceKey.get(sourceKey)
      if (code === undefined || !RETYPED_CODES.has(code) || !isDashCell(value)) continue
      const keyId = keyIdByCode.get(code)
      if (keyId === undefined || held.some((one) => one.keyId === keyId) || slots.some((one) => one.keyId === keyId)) continue
      if (VOCABULARY_FACETS.some((facet) => facet.code === code && facet.valueType === "vocabulary")) {
        slots.push({ keyId, value: { kind: "vocabulary", termIds: { state: "not-applicable" } } })
      } else if (NUMBER_FACETS.some((facet) => facet.code === code)) {
        slots.push({ keyId, value: { kind: "number", values: { state: "not-applicable" } } })
      }
    }
    return slots
  }

  /**
   * The number key (or keys, `facets.ts` の `NUMBER_SPLITS`) a v1 source cell
   * reads into, or none when it is not a numeric key at all. A merged source
   * (`SNV Number` and friends) keeps the target key's identity and canonical
   * unit but reads with its own rule, which is what tells `variant-number`
   * which kind a bare count belongs to.
   */
  const singleTextNumberKey = (sourceKey: string): TextNumberKey[] => {
    const mergedRead = MERGED_READERS.get(sourceKey)
    const code = mergedRead === undefined
      ? TEXT_NUMBERS.find((one) => one.source === sourceKey)?.code
      : codeBySourceKey.get(sourceKey)
    const target = code === undefined ? undefined : TEXT_NUMBERS.find((one) => one.code === code)
    if (target === undefined) return []
    return [mergedRead === undefined ? target : { ...target, read: mergedRead }]
  }

  const values: ValueSlot[] = []

  const criteriaKeyId = keyIdByCode.get(input.accessCriteriaKeyCode)
  const termCode = doc.criteria ? accessCriteriaTermCode(doc.criteria) : null
  const termId = termCode ? termIdBySetAndCode.get(`${ACCESS_CRITERIA_SET}/${termCode}`) : undefined
  if (criteriaKeyId && termId) {
    values.push({
      keyId: criteriaKeyId,
      value: { kind: "vocabulary", termIds: held([termId]) },
    })
  }

  const typeOfDataKeyId = keyIdByCode.get(input.typeOfDataKeyCode)
  const readTypeOfData = input.readTypeOfData ?? richTextFromPlain
  if (typeOfDataKeyId && (doc.typeOfData?.ja || doc.typeOfData?.en)) {
    values.push({
      keyId: typeOfDataKeyId,
      value: {
        kind: "text",
        text: {
          ja: held(readTypeOfData(doc.typeOfData.ja ?? "", "ja")),
          en: held(readTypeOfData(doc.typeOfData.en ?? "", "en")),
        },
      },
    })
  }

  const experiments: Experiment[] = (doc.experiments ?? []).map((e, i) => {
    // The numbers read out of the cells, gathered by the key they belong to:
    // several v1 cells may be the same key (`facets.ts` の `MERGED_SOURCES`),
    // one v1 cell may become several keys (`facets.ts` の `NUMBER_SPLITS`), and
    // a key may appear once.
    const numbers = new Map<string, NumberValue[]>()
    // A code this cell attempted but read nothing usable out of, and why: the
    // slot becomes `unknown` rather than disappearing, because the cell said
    // something.
    const unresolved = new Set<string>()
    // A number key whose row the article filled with a dash (`dashes.ts`).
    const notApplicable = new Set<string>()
    for (const [sourceKey, value] of Object.entries(e.data ?? {})) {
      const text = kept(sourceKey, "ja", value.ja?.text ?? "")
      const keys = NUMBER_SPLITS.get(sourceKey) ?? singleTextNumberKey(sourceKey)
      if (keys.length === 0) continue
      if (isDashCell(value)) {
        for (const key of keys) notApplicable.add(key.code)
        continue
      }
      const results = keys.map((key) => {
        const reader = withHandReadings(sourceKey, key.read, input.byHand)
        return { key, ...readCell(text, reader) }
      })
      // **A line every candidate this cell was tried against declined is
      // residue.** A line only some of them could read is not about the
      // others — `Coverage` splits into a depth and a breadth, and a depth
      // line is not a breadth key's problem.
      const trulyDeclined = results.length <= 1
        ? (results[0]?.declined ?? [])
        : (results[0]?.declined ?? []).filter((line) => results.every((r) => r.declined.includes(line)))
      for (const line of trulyDeclined) input.unread.push({ dataset: dataset.label, sourceKey, line })

      for (const { key, read } of results) {
        const canonical = key.canonicalUnit
        // **A key with no canonical unit converts nothing.** Its unit is the
        // kind of thing counted — SNVs, indels, fold coverage — not a scale,
        // so the unit written is the unit stored. Running those through the
        // converter would have it turn `SNVs` into null, which it refuses, and
        // the value would disappear without a word.
        const stored = read.flatMap((raw) => {
          // A row labelled with the dataset it is already filed under adds
          // nothing: the label existed to tell sibling rows apart, and those
          // have gone to the datasets they were about (`ownLines`).
          const one = raw.label === dataset.label ? { ...raw, label: null } : raw
          if (canonical === null) return [storedNumber(one, one.value, one.unit, one.high, translations)]
          const converted = one.unit === canonical ? one.value : convert(one.value, one.unit, canonical)
          // A number in a sibling key's unit is that key's to store: a depth
          // read by the breadth half of a split cell is not residue.
          if (converted === null && results.some((other) => other.key !== key && other.key.canonicalUnit !== null
            && (one.unit === other.key.canonicalUnit || convert(one.value, one.unit, other.key.canonicalUnit) !== null))) {
            return []
          }
          if (converted === null) {
            input.unread.push({
              dataset: dataset.label,
              sourceKey,
              line: `単位が合わない: ${one.value} ${one.unit ?? ""}`,
            })
            return []
          }
          const convertedHigh = one.high === null
            ? null
            : (one.unit === canonical ? one.high : convert(one.high, one.unit, canonical))
          return [storedNumber(one, converted, canonical, convertedHigh, translations)]
        })
        numbers.set(key.code, [...(numbers.get(key.code) ?? []), ...stored])
        if (trulyDeclined.length > 0) unresolved.add(key.code)
      }
    }

    const facetSlots = narrowedToCaption(
      facetValueSlots(e, { keyIdByCode, termIdBySetAndCode, knownCode, termIdsOf: input.termIdsOf }, diseaseTextOf(e)),
      captionOf(e, dataset.label),
    )
    return {
      id: `experiment-${i + 1}`,
      label: single(e.header?.ja?.text, e.header?.en?.text),
      values: [
        ...Object.entries(e.data ?? {}).flatMap(([sourceKey, value]) => {
          const code = codeBySourceKey.get(sourceKey)
          if (code === undefined) throw new Error(`no catalog key for ${JSON.stringify(sourceKey)}`)
          const keyId = keyIdByCode.get(code)
          if (keyId === undefined) throw new Error(`catalog key ${code} was not inserted`)
          // A key that is a facet now holds the typed value instead of the prose
          // it was read out of; one key cannot have both.
          if (RETYPED_CODES.has(code) || numbers.has(code)) return []
          if (notApplicable.has(code)) return []
          // The row one language's table had a dash in and the other's had not
          // at all does not apply in either. The dash is looked for in the
          // cell as stored: read as markdown, it is an empty list item.
          if (isDashCell(value)) {
            return [{ keyId, value: { kind: "text" as const, text: { ja: { state: "not-applicable" as const }, en: { state: "not-applicable" as const } } } }]
          }
          const ja = keptProse(sourceKey, "ja", value.ja)
          const en = keptProse(sourceKey, "en", value.en)
          const dashed = { ja: DASH.test(value.ja?.text ?? ""), en: DASH.test(value.en?.text ?? "") }
          if (isEmptyRichText(ja) && isEmptyRichText(en) && !dashed.ja && !dashed.en) return []
          const side = (lang: Language, rich: RichText): Slot<RichText> => (dashed[lang] ? { state: "not-applicable" } : held(rich))
          return [{ keyId, value: { kind: "text" as const, text: { ja: side("ja", ja), en: side("en", en) } } }]
        }),
        ...[...notApplicable].flatMap((code): ValueSlot[] => {
          const keyId = keyIdByCode.get(code)
          if (keyId === undefined || (numbers.get(code)?.length ?? 0) > 0) return []
          return [{ keyId, value: { kind: "number", values: { state: "not-applicable" } } }]
        }),
        ...[...numbers].flatMap(([code, nums]): ValueSlot[] => {
          const keyId = keyIdByCode.get(code)
          if (keyId === undefined) return []
          if (nums.length > 0) {
            return [{ keyId, value: { kind: "number", values: { state: "value", value: nums } } }]
          }
          // A cell that said something no rule could read is a question, not a
          // key nobody touched — the words themselves are in `input.unread`.
          // A cell with nothing to read at all leaves no slot: the question
          // never came up for this experiment.
          return unresolved.has(code)
            ? [{ keyId, value: { kind: "number", values: { state: "unknown" } } }]
            : []
        }),
        ...facetSlots,
        ...dashedFacets(e, facetSlots),
      ],
    }
  })

  return {
    releaseDate: isPortalIssuedId(dataset.label) ? dataset.firstListedOn : null,
    fileSelection: [],
    values,
    experiments,
  }
}

export interface AccessionDateRow {
  accession: string
  datePublished: string | null
  dateModified: null
  source: string
}

/**
 * The archive cache, filled from the dump for development.
 *
 * In production a batch takes these from upstream. Here the nearest thing the
 * dump holds is the release date of the first published version that listed the
 * dataset, which is not what the archive has — but the cache being empty is
 * worse than it being approximate: the whole design assumes a reader never sees an
 * unfilled cache, and a development database that has one puts that case back
 * into every screen. `source` records where the values came from, so nothing
 * mistakes them for the archive's own.
 */
export function buildAccessionDates(
  datasets: readonly { label: string, firstListedOn: string | null }[],
): AccessionDateRow[] {
  return datasets
    .filter((dataset) => !isPortalIssuedId(dataset.label) && dataset.firstListedOn !== null)
    .map((dataset) => ({
      accession: dataset.label,
      datePublished: dataset.firstListedOn,
      dateModified: null,
      source: "v1-dump",
    }))
}

export interface CauRow {
  humLabel: string
  applicationId: string
  piNameJa: string
  piNameEn: string
  affiliationJa: string
  affiliationEn: string
  countryJa: string
  countryEn: string
  researchTitleJa: string
  researchTitleEn: string
  periodStart: string | null
  periodEnd: string | null
  datasetAccessions: string[]
}

/**
 * v1 stored the controlled-access users on the research document without the
 * application id they came from, and that id is the key upstream identifies an
 * application by. Numbering them by position gives the uniqueness the table
 * requires; the real ids arrive when the batch reads the application database.
 */
/** v1 wrote an empty string where there was no date; the column takes null. */
function dateOrNull(value: string | null | undefined): string | null {
  return value === undefined || value === "" ? null : value
}

/** v1 kept no state, so the country is named without one. */
export function buildCauRows(humLabel: string, entries: EsControlledAccessUser[]): CauRow[] {
  return entries.map((e, i) => {
    const country = countryName(e.organization?.address?.country ?? "", "")
    return {
      humLabel,
      applicationId: `es-${String(i + 1).padStart(4, "0")}`,
      piNameJa: e.name?.ja?.text ?? "",
      piNameEn: e.name?.en?.text ?? "",
      affiliationJa: e.organization?.name?.ja?.text ?? "",
      affiliationEn: e.organization?.name?.en?.text ?? "",
      countryJa: country.ja,
      countryEn: country.en,
      researchTitleJa: e.researchTitle?.ja ?? "",
      researchTitleEn: e.researchTitle?.en ?? "",
      periodStart: dateOrNull(e.periodOfDataUse?.startDate),
      periodEnd: dateOrNull(e.periodOfDataUse?.endDate),
      datasetAccessions: e.datasetIds ?? [],
    }
  })
}
