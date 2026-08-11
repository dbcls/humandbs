/**
 * Turning what an upstream system says into the content of a draft.
 *
 * **Nothing here reads a database or a network.** The two upstreams are read in
 * `templates.server.ts`; this is the part that decides what of their answer a
 * curator is handed, and it is the part worth testing on its own.
 *
 * Two rules shape all of it (docs/editing.md の「上流からの下書き」):
 *
 * - **Only what a public page shows.** The application form holds addresses,
 *   telephone numbers and every collaborator, and the content it seeds carries
 *   an email address and an ORCID out to the public API. So the investigator
 *   arrives as a name, an affiliation and a country, and nothing else
 * - **A value the catalog has no word for is not written.** Upstream spells its
 *   vocabularies its own way — INSDC writes `WXS` where the catalog writes
 *   `WES` — and minting a term to fit is how a catalog drifts from the data.
 *   What did not fit comes back named, for the screen to show before anything
 *   is created
 */

import { filled } from "~/content/empty"
import type {
  ContentValue,
  DatasetContent,
  Experiment,
  ResearchContent,
  RichText,
  TranslatedRichText,
  TranslatedText,
  ValueSlot,
} from "~/content/types"
import type { DsBranchDetail, JgadRegistration } from "~/upstream/application-db.server"
import type { DraSubmission } from "~/upstream/dra.server"

import type { EditableCatalog, EditableKey, EditableTerm } from "./queries.server"

/** The catalog keys a seeded draft writes under. */
const ACCESS_TYPE_KEY = "access-criteria"
const TYPE_OF_DATA_KEY = "type-of-data"
const DISEASE_KEY = "disease-icd10"
const METHOD_KEY = "experimental-method"
const PLATFORM_KEY = "platform"
const READ_TYPE_KEY = "read-type"
const READ_LENGTH_KEY = "read-length"

/**
 * The access type the application form's number means. 1 is unrestricted, which
 * no JGA dataset is, and 3 is an application covering both — neither says what
 * one dataset is, so neither is written.
 */
const ACCESS_TERM_BY_NUMBER: ReadonlyMap<number, string> = new Map([
  [2, "controlled-access-type-1"],
  [4, "controlled-access-type-2"],
])

/** Everything in DRA is out in the open; that is what the archive is. */
const UNRESTRICTED_TERM = "unrestricted-access"

/** A library layout as DRA spells it, and as the catalog spells it. */
const READ_TYPE_TERM: ReadonlyMap<string, string> = new Map([
  ["PAIRED", "paired-end"],
  ["SINGLE", "single-end"],
])

/** A value upstream stated that the catalog has no word for. */
export interface DroppedValue {
  /** The key it would have gone under, by the code the catalog screen shows. */
  keyCode: string
  value: string
}

/** A dataset to be created: its accession, its content, and what did not fit. */
export interface DatasetSeed {
  /** The accession, which becomes the dataset's primary id when it is created. */
  label: string
  content: DatasetContent
  dropped: DroppedValue[]
}

// === research ===

/**
 * The research an approved application describes.
 *
 * A language upstream left empty stays empty rather than becoming `unknown`:
 * a value in one language and an empty string in the other is what untranslated
 * means, and the publish gate lists it as such. `unknown` is a mark a curator
 * puts on a field they are still asking about, and upstream saying nothing is
 * not that.
 */
export function researchContentFrom(branch: DsBranchDetail): ResearchContent {
  const provider = {
    id: newId(),
    name: pair(branch.piNameJa, branch.piNameEn),
    organization: {
      name: pair(branch.affiliationJa, branch.affiliationEn),
      // The country is one value in the form, and it is written in English.
      address: pair(branch.country, branch.country),
    },
    orcid: filled(""),
    email: filled(""),
  }

  return {
    title: pair(branch.titleJa, branch.titleEn),
    summary: {
      aims: prose(branch.aimsJa, branch.aimsEn),
      methods: prose(branch.methodsJa, branch.methodsEn),
      targets: prose(branch.targetsJa, branch.targetsEn),
      url: { ja: filled([]), en: filled([]) },
    },
    summaryShort: {
      methods: prose("", ""),
      targets: prose("", ""),
      typeOfData: prose("", ""),
    },
    releaseNote: prose("", ""),
    dataProviders: hasName(branch) ? [provider] : [],
    researchProjects: [],
    grants: [],
    relatedPublications: [],
    datasetIds: [],
  }
}

function hasName(branch: DsBranchDetail): boolean {
  return branch.piNameJa !== "" || branch.piNameEn !== ""
}

// === datasets ===

/**
 * A dataset registered with JGA.
 *
 * It carries one experiment, labelled with the assay the registration states.
 * A published dataset holds one experiment four times out of five, so the shape
 * matches what a curator would have written; the diseases the application names
 * go in it, because that is where the catalog keeps them.
 */
export function jgadDatasetSeed(
  registration: JgadRegistration,
  branch: DsBranchDetail | null,
  catalog: EditableCatalog,
): DatasetSeed {
  const dropped: DroppedValue[] = []
  const values: ValueSlot[] = []

  const accessType = branch === null
    ? null
    : ACCESS_TERM_BY_NUMBER.get(branch.dataAccess ?? 0) ?? null
  if (accessType !== null) {
    take(values, dropped, vocabulary(catalog, ACCESS_TYPE_KEY, "dataset", [accessType]))
  }

  const label = registration.datasetType === "" ? registration.title : registration.datasetType
  if (label !== "") {
    take(values, dropped, text(catalog, TYPE_OF_DATA_KEY, "dataset", label, label))
  }

  return {
    label: registration.accession,
    content: {
      releaseDate: null,
      fileSelection: [],
      values,
      experiments: [experiment(catalog, dropped, label, diseasesOf(branch, catalog, dropped))],
    },
    dropped,
  }
}

/**
 * A dataset registered with DRA.
 *
 * One experiment per library strategy, which is how an article's tables are
 * divided; the libraries themselves are per-sample and number in the hundreds
 * (`~/upstream/dra.ts`).
 */
export function draDatasetSeed(
  submission: DraSubmission,
  branch: DsBranchDetail | null,
  catalog: EditableCatalog,
): DatasetSeed {
  const dropped: DroppedValue[] = []
  const values: ValueSlot[] = []

  take(values, dropped, vocabulary(catalog, ACCESS_TYPE_KEY, "dataset", [UNRESTRICTED_TERM]))
  if (submission.title !== "") {
    take(values, dropped, text(catalog, TYPE_OF_DATA_KEY, "dataset", submission.title, submission.title))
  }

  const diseases = diseasesOf(branch, catalog, dropped)
  const experiments = submission.groups.map((group) => {
    const own: ValueSlot[] = [...diseases]
    take(own, dropped, vocabulary(catalog, METHOD_KEY, "experiment", [group.strategy]))
    take(own, dropped, vocabulary(catalog, PLATFORM_KEY, "experiment", group.instrumentModels))
    const readType = READ_TYPE_TERM.get(group.layout ?? "")
    if (readType !== undefined) {
      take(own, dropped, vocabulary(catalog, READ_TYPE_KEY, "experiment", [readType]))
    }
    if (group.readLength !== null) {
      take(own, dropped, number(catalog, READ_LENGTH_KEY, group.readLength))
    }
    return { id: newId(), label: filled(group.strategy), values: own }
  })

  return {
    label: submission.accession,
    content: {
      releaseDate: null,
      fileSelection: [],
      values,
      // A submission whose libraries all failed still gets somewhere to write.
      experiments: experiments.length > 0
        ? experiments
        : [experiment(catalog, dropped, "", diseases)],
    },
    dropped,
  }
}

function experiment(
  catalog: EditableCatalog,
  dropped: DroppedValue[],
  label: string,
  diseases: ValueSlot[],
): Experiment {
  const values = [...diseases]
  if (label !== "") {
    take(values, dropped, vocabulary(catalog, METHOD_KEY, "experiment", [label]))
  }
  return { id: newId(), label: filled(label), values }
}

/** The diseases the application names, as terms of the catalog's ICD10 set. */
function diseasesOf(
  branch: DsBranchDetail | null,
  catalog: EditableCatalog,
  dropped: DroppedValue[],
): ValueSlot[] {
  if (branch === null) return []
  const codes = icd10Codes(branch.icd10)
  if (codes.length === 0) return []
  const values: ValueSlot[] = []
  take(values, dropped, vocabulary(catalog, DISEASE_KEY, "experiment", codes))
  return values
}

/**
 * The ICD10 codes written into an application's disease field.
 *
 * It is a free-text box: the codes arrive separated by commas of both widths,
 * by semicolons and by spaces, written with or without the point, and the box
 * also holds `-` and `dummy`. Anything that is not shaped like a code is left
 * out rather than turned into one.
 */
export function icd10Codes(raw: string): string[] {
  const shape = /^[A-Z][0-9]{2}[0-9A-Z]{0,2}$/
  const codes = raw
    .split(/[,、;；/\s]+/)
    .map((token) => token.replace(/[.\s]/g, "").toUpperCase())
    .filter((token) => shape.test(token))
  return [...new Set(codes)]
}

// === writing a value under a key ===

/** A slot that was built, or the values that had nowhere to go. */
type Built
  = | { slot: ValueSlot, dropped: DroppedValue[] }
    | { slot: null, dropped: DroppedValue[] }

function take(values: ValueSlot[], dropped: DroppedValue[], built: Built): void {
  if (built.slot !== null) values.push(built.slot)
  dropped.push(...built.dropped)
}

function keyOf(
  catalog: EditableCatalog,
  code: string,
  scope: "dataset" | "experiment",
): EditableKey | undefined {
  return catalog.keys.find((key) => key.code === code && key.scope === scope)
}

/**
 * The terms upstream's words name, and the words that name none.
 *
 * A term is found by its code or by its English label, case aside. Codes have
 * to come first because ICD10 is written as codes while its labels are disease
 * names; labels matter because the instrument models an archive states are
 * spelled exactly as the catalog holds them.
 */
function matchTerms(
  terms: readonly EditableTerm[],
  setId: string,
  values: readonly string[],
): { found: EditableTerm[], missed: string[] } {
  const inSet = terms.filter((term) => term.setId === setId)
  const found: EditableTerm[] = []
  const missed: string[] = []
  for (const value of values) {
    const wanted = value.trim()
    if (wanted === "") continue
    const term = inSet.find((candidate) => same(candidate.code, wanted))
      ?? inSet.find((candidate) => same(candidate.labelEn, wanted))
    if (term === undefined) missed.push(wanted)
    else if (!found.includes(term)) found.push(term)
  }
  return { found, missed }
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

function vocabulary(
  catalog: EditableCatalog,
  code: string,
  scope: "dataset" | "experiment",
  values: readonly string[],
): Built {
  const key = keyOf(catalog, code, scope)
  if (key?.vocabularySetId == null) return { slot: null, dropped: named(code, values) }

  const { found, missed } = matchTerms(catalog.terms, key.vocabularySetId, values)
  const dropped = named(code, missed)
  const chosen = key.multiple ? found : found.slice(0, 1)
  if (chosen.length === 0) return { slot: null, dropped }
  return {
    slot: {
      keyId: key.id,
      value: { kind: "vocabulary", termIds: filled(chosen.map((term) => term.id)) },
    },
    dropped,
  }
}

function text(
  catalog: EditableCatalog,
  code: string,
  scope: "dataset" | "experiment",
  ja: string,
  en: string,
): Built {
  const key = keyOf(catalog, code, scope)
  if (key === undefined) return { slot: null, dropped: named(code, [ja || en]) }
  return { slot: { keyId: key.id, value: { kind: "text", text: prose(ja, en) } }, dropped: [] }
}

function number(catalog: EditableCatalog, code: string, value: number): Built {
  const key = keyOf(catalog, code, "experiment")
  if (key === undefined) return { slot: null, dropped: named(code, [String(value)]) }
  const unit = key.canonicalUnit
  const held: ContentValue = {
    kind: "number",
    value: filled({ value, unit, inputValue: value, inputUnit: unit }),
  }
  return { slot: { keyId: key.id, value: held }, dropped: [] }
}

function named(keyCode: string, values: readonly string[]): DroppedValue[] {
  return values.filter((value) => value !== "").map((value) => ({ keyCode, value }))
}

// === values ===

function pair(ja: string, en: string): TranslatedText {
  return { ja: filled(ja), en: filled(en) }
}

function prose(ja: string, en: string): TranslatedRichText {
  return { ja: filled(lines(ja)), en: filled(lines(en)) }
}

/**
 * Free text as prose, one line at a time.
 *
 * The application form is a plain text box, not markdown, so the text is kept
 * exactly: a line becomes a line and a blank line separates paragraphs. Reading
 * it as markdown would turn a leading hyphen into a list the tree cannot hold
 * and refuse the whole seeding over a value nobody wrote as markup.
 */
function lines(value: string): RichText {
  if (value.trim() === "") return []
  return value.replace(/\r\n?/g, "\n").split("\n")
    .map((line) => (line.trim() === "" ? [] : [{ text: line }]))
}

function newId(): string {
  return crypto.randomUUID()
}
