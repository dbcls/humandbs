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
 *   carry.
 * - **Fields v2 holds as one language become one.** Publication titles and
 *   experiment labels are single-valued in v2; the language that carries the
 *   value wins, and where both do they agree in 94% or more of the data.
 * - **References become identities.** A dataset is addressed by its uuid, not
 *   by the `JGAD…` string, which is a label that can be corrected.
 * - **Prose stops being markdown** (`richtext.ts`).
 */

import { isPortalIssuedId } from "~/admin/labels"
import { isEmptyRichText } from "~/content/richtext"
import { convert } from "~/content/units"
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
  EsLink,
  EsResearchVersion,
  EsSummaryShort,
  PublishedDataset,
} from "./es"
import { facetValueSlots, MERGED_READERS, RETYPED_CODES, TEXT_NUMBERS } from "./facets"
import { readCell, storedNumber, withHandReadings, type ReadNumber } from "./numbers"
import { richTextFromMarkdown, richTextFromPlain } from "./richtext"

function held<T>(value: T): Slot<T> {
  return { state: "value", value }
}

/** v1's extracted text is markdown; the HTML it came from is left behind. */
function prose(value: EsBilingualRich | null | undefined): TranslatedRichText {
  return {
    ja: held(richTextFromMarkdown(value?.ja?.text ?? "")),
    en: held(richTextFromMarkdown(value?.en?.text ?? "")),
  }
}

/** A v1 rich field that v2 holds as a value, which is its text without markup. */
function valueText(value: EsBilingualRich | null | undefined): TranslatedText {
  return { ja: held(value?.ja?.text ?? ""), en: held(value?.en?.text ?? "") }
}

function plainText(value: EsBilingual | null | undefined): TranslatedText {
  return { ja: held(value?.ja ?? ""), en: held(value?.en ?? "") }
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
}

export function buildResearchContent(input: ResearchContentInput): ResearchContent {
  const { version: rv, listingSummary, datasetIdByLabel } = input

  const dataProviders: DataProvider[] = (rv.dataProvider ?? []).map((p, i) => ({
    id: `data-provider-${i + 1}`,
    name: valueText(p.name),
    organization: {
      name: valueText(p.organization?.name),
      address: valueText(p.organization?.address),
    },
    orcid: single(p.orcid),
    email: single(p.email),
  }))

  const researchProjects: ResearchProject[] = (rv.researchProject ?? []).map((p, i) => ({
    id: `research-project-${i + 1}`,
    name: valueText(p.name),
    url: localizedLinks([p.url?.ja], [p.url?.en], `research-project-${i + 1}-url`),
  }))

  const grants: Grant[] = (rv.grant ?? []).map((g, i) => ({
    id: `grant-${i + 1}`,
    title: plainText(g.title),
    agency: { name: plainText(g.agency?.name) },
    grantIds: g.id ?? [],
  }))

  const relatedPublications: RelatedPublication[] = (rv.relatedPublication ?? []).map((p, i) => ({
    id: `publication-${i + 1}`,
    title: single(p.title?.en, p.title?.ja),
    doi: single(p.doi),
    datasetIds: datasetIdentities(p.datasetIds ?? [], datasetIdByLabel),
  }))

  return {
    title: plainText(rv.title),
    summary: {
      aims: prose(rv.summary?.aims),
      methods: prose(rv.summary?.methods),
      targets: prose(rv.summary?.targets),
      url: localizedLinks(rv.summary?.url?.ja ?? [], rv.summary?.url?.en ?? [], "summary-url"),
    },
    listingSummary: {
      methods: prose(listingSummary?.methods),
      targets: prose(listingSummary?.targets),
      typeOfData: prose(listingSummary?.typeOfData),
    },
    releaseNote: prose(rv.releaseNote),
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
 * label is not "which part of this dataset" — it names another dataset
 * entirely, and it is the only thing saying which row belongs to whom. Measured
 * over the dump: 18,272 labelled lines, of which **94.9% name a sibling rather
 * than the dataset whose cell they sit in**.
 *
 * Left as they are, every one of those values lives in as many places as the
 * research has datasets, and an editor correcting one has to find the rest.
 *
 * **A line is dropped only where the dataset it names carries the same line
 * itself.** That is what makes this lossless rather than a guess: 34,797 of the
 * 34,842 borrowed lines are word-for-word present on the dataset they are
 * about. The 45 that are not — 15 naming a dataset with no line of its own, 30
 * disagreeing with what that dataset says — stay where they are. Something has
 * to look at those, and quietly deleting them would be the one outcome that
 * cannot be reviewed.
 */
const LANGUAGES = ["ja", "en"] as const
type Language = (typeof LANGUAGES)[number]

const LINE_PART = "\u0000"

function lineMark(label: string, sourceKey: string, lang: Language, said: string): string {
  return [label, sourceKey, lang, said].join(LINE_PART)
}

/** What a line says, and the datasets its label names, if any. */
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
 * The first colon standing outside any bracket. A value carries colons of its
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

/** Every line each dataset says about itself, which is what makes a copy a copy. */
export function ownLines(datasets: readonly PublishedDataset[]): ReadonlySet<string> {
  const labels = new Set(datasets.map((one) => one.label))
  const marks = new Set<string>()
  for (const one of datasets) {
    for (const experiment of one.doc.experiments ?? []) {
      for (const [sourceKey, value] of Object.entries(experiment.data ?? {})) {
        for (const lang of LANGUAGES) {
          for (const line of (value[lang]?.text ?? "").split("\n")) {
            const { said, about } = readLine(line, labels)
            if (about.includes(one.label)) marks.add(lineMark(one.label, sourceKey, lang, said))
          }
        }
      }
    }
  }
  return marks
}

export interface DatasetContentInput {
  dataset: PublishedDataset
  /** `content_key.code` to the identity it was inserted under. */
  keyIdByCode: Map<string, string>
  /** The v1 key string of an experiment value to a `content_key.code`. */
  codeBySourceKey: Map<string, string>
  /** `{set code}/{term code}` to identity. */
  termIdBySetAndCode: Map<string, string>
  /** Whether the ICD10 dictionary holds a code, which is what resolves one. */
  knownCode: (code: string) => boolean
  accessCriteriaKeyCode: string
  typeOfDataKeyCode: string
  /** Every dataset label in the dump, so a line's label can be recognised. */
  datasetLabels: ReadonlySet<string>
  /** What each dataset says about itself (`ownLines`). */
  ownLines: ReadonlySet<string>
  /**
   * Where the lines no rule could read are collected. **They are not dropped
   * quietly**: a cell that says something this cannot hold as a number is work
   * for somebody, and the list is what that work is done from.
   */
  unread: { dataset: string, sourceKey: string, line: string }[]
  /** The lines somebody read by hand (`numbers.ts` の `byHand`). */
  byHand: ReadonlyMap<string, ReadNumber[]>
}

export function buildDatasetContent(input: DatasetContentInput): DatasetContent {
  const { dataset, keyIdByCode, codeBySourceKey, termIdBySetAndCode, knownCode } = input
  const doc = dataset.doc

  /** A cell with the lines about other datasets taken out (`ownLines`). */
  const kept = (sourceKey: string, lang: Language, text: string): string => {
    const lines = text.split("\n")
    const staying = lines.filter((line) => {
      const { said, about } = readLine(line, input.datasetLabels)
      if (about.length === 0 || about.includes(dataset.label)) return true
      // Only where every dataset it names says the same thing itself. Anything
      // else is the one copy of that value, wherever it happens to sit.
      return !about.every((label) => input.ownLines.has(lineMark(label, sourceKey, lang, said)))
    })
    return staying.length === lines.length ? text : staying.join("\n")
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
  if (typeOfDataKeyId && (doc.typeOfData?.ja || doc.typeOfData?.en)) {
    values.push({
      keyId: typeOfDataKeyId,
      value: {
        kind: "text",
        text: {
          ja: held(richTextFromPlain(doc.typeOfData.ja ?? "")),
          en: held(richTextFromPlain(doc.typeOfData.en ?? "")),
        },
      },
    })
  }

  const experiments: Experiment[] = (doc.experiments ?? []).map((e, i) => {
    // The numbers read out of the cells, gathered by the key they belong to:
    // several v1 cells may be the same key (`facets.ts` の `MERGED_SOURCES`),
    // and a key may appear once.
    const numbers = new Map<string, NumberValue[]>()
    for (const [sourceKey, value] of Object.entries(e.data ?? {})) {
      const rule = MERGED_READERS.get(sourceKey)
        ?? TEXT_NUMBERS.find((one) => one.source === sourceKey)?.read
      const code = codeBySourceKey.get(sourceKey)
      if (rule === undefined || code === undefined) continue
      const reader = withHandReadings(sourceKey, rule, input.byHand)
      const canonical = TEXT_NUMBERS.find((one) => one.code === code)?.canonicalUnit ?? null
      const { read, declined } = readCell(kept(sourceKey, "ja", value.ja?.text ?? ""), reader)
      for (const line of declined) input.unread.push({ dataset: dataset.label, sourceKey, line })
      // **A key with no canonical unit converts nothing.** Its unit is the kind
      // of thing counted — SNVs, indels, fold coverage — not a scale, so the
      // unit written is the unit stored. Running those through the converter
      // asks it to turn `SNVs` into null, which it refuses, and the value would
      // disappear without a word.
      const stored = read.flatMap((raw) => {
        // A row labelled with the dataset it is already filed under says
        // nothing: the label existed to tell sibling rows apart, and those have
        // gone to the datasets they were about (`ownLines`).
        const one = raw.label === dataset.label ? { ...raw, label: null } : raw
        if (canonical === null) return [storedNumber(one, one.value, one.unit)]
        const converted = one.unit === canonical ? one.value : convert(one.value, one.unit, canonical)
        return converted === null
          ? (input.unread.push({ dataset: dataset.label, sourceKey, line: `単位が合わない: ${one.value} ${one.unit ?? ""}` }), [])
          : [storedNumber(one, converted, canonical)]
      })
      numbers.set(code, [...(numbers.get(code) ?? []), ...stored])
    }

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
          // it was read out of; one key cannot carry both.
          if (RETYPED_CODES.has(code) || numbers.has(code)) return []
          const ja = richTextFromMarkdown(kept(sourceKey, "ja", value.ja?.text ?? ""))
          const en = richTextFromMarkdown(kept(sourceKey, "en", value.en?.text ?? ""))
          if (isEmptyRichText(ja) && isEmptyRichText(en)) return []
          return [{ keyId, value: { kind: "text" as const, text: { ja: held(ja), en: held(en) } } }]
        }),
        ...[...numbers].flatMap(([code, held]) => {
          const keyId = keyIdByCode.get(code)
          // A key with nothing read is a key with no slot: the cell said
          // something, but not something this can hold as a number.
          return keyId === undefined || held.length === 0
            ? []
            : [{ keyId, value: { kind: "number" as const, values: { state: "value" as const, value: held } } }]
        }),
        ...facetValueSlots(e, { keyIdByCode, termIdBySetAndCode, knownCode }),
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
 * dataset, which is not what the archive says — but the cache being empty is
 * worse than it being approximate: the whole design says a reader never sees an
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
  country: string
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

export function buildCauRows(humLabel: string, entries: EsControlledAccessUser[]): CauRow[] {
  return entries.map((e, i) => ({
    humLabel,
    applicationId: `es-${String(i + 1).padStart(4, "0")}`,
    piNameJa: e.name?.ja?.text ?? "",
    piNameEn: e.name?.en?.text ?? "",
    affiliationJa: e.organization?.name?.ja?.text ?? "",
    affiliationEn: e.organization?.name?.en?.text ?? "",
    country: e.organization?.address?.country ?? "",
    researchTitleJa: e.researchTitle?.ja ?? "",
    researchTitleEn: e.researchTitle?.en ?? "",
    periodStart: dateOrNull(e.periodOfDataUse?.startDate),
    periodEnd: dateOrNull(e.periodOfDataUse?.endDate),
    datasetAccessions: e.datasetIds ?? [],
  }))
}
