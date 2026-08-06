/**
 * Preparing the public projection for a screen.
 *
 * The projection only ever drops (`app/content/public.ts`), which leaves two
 * things for the page to do, and they are done here rather than in components:
 * pick a language for each value, and resolve catalog labels and catalog order.
 * Both add something the content does not hold, which is why they are outside
 * the projection — and both need the catalog, which is why they are not in a
 * component. Prose keeps its tree all the way to the page: there is no markup
 * to parse and nothing to sanitise, so nothing has to happen to it here.
 *
 * Whether the page shows the untranslated notice is decided here for the same
 * reason: it is the disjunction over exactly the fields the page renders, and
 * only the code that walks them can know it. Fields that exist in the content
 * but are not rendered — a provider's ORCID, e-mail and address — do not count
 * towards it. They stay in the content and in the JSON API; the page does not
 * show them, so the reader cannot be sent looking for them.
 */

import type {
  ContentValue,
  DatasetContent,
  Link,
  LocalizedLinks,
  ResearchContent,
  RichText,
  Slot,
  TranslatedRichText,
  TranslatedText,
  ValueSlot,
} from "~/content/types"
import { resolveLinks, resolveRichText, resolveText, type Locale } from "~/i18n/locale"

export type FieldView
  = | { state: "not-applicable" }
    | { state: "rich", text: RichText, untranslated: boolean }
    | { state: "plain", text: string, untranslated: boolean }

export interface CatalogKeyView {
  id: string
  code: string
  labelJa: string
  labelEn: string
  position: number
  showOnPublicPage: boolean
}

export interface VocabularyTermView {
  code: string
  labelJa: string | null
  labelEn: string
}

export interface CatalogView {
  keyById: ReadonlyMap<string, CatalogKeyView>
  keyByCode: ReadonlyMap<string, CatalogKeyView>
  termById: ReadonlyMap<string, VocabularyTermView>
}

/**
 * The two dataset-scoped keys the pages place themselves instead of listing in
 * catalog order. They are what a reader looks for first — access type decides
 * whether the data can be had at all — and access type is a badge rather than a
 * line of text. Their labels still come from the catalog, so renaming works.
 */
export const ACCESS_TYPE_KEY = "access-criteria"
export const TYPE_OF_DATA_KEY = "type-of-data"

export function keyLabel(key: CatalogKeyView, locale: Locale): string {
  return locale === "ja" ? key.labelJa : key.labelEn
}

export function termLabel(term: VocabularyTermView, locale: Locale): string {
  return locale === "ja" ? term.labelJa ?? term.labelEn : term.labelEn
}

/**
 * Records whether anything on the page fell back to the other language. The
 * notice is per page rather than per field: a reader needs to know the page is
 * not fully translated, and a badge on every value would cover a page that has
 * no translation at all in badges.
 */
interface Fallbacks {
  note: (untranslated: boolean) => boolean
  seen: () => boolean
}

function fallbackTracker(): Fallbacks {
  let seen = false
  return {
    note: (untranslated) => {
      if (untranslated) seen = true
      return untranslated
    },
    seen: () => seen,
  }
}

const EMPTY: FieldView = { state: "plain", text: "", untranslated: false }

function translated(slot: Slot<TranslatedText>, locale: Locale, fallbacks: Fallbacks): FieldView {
  if (slot.state === "not-applicable") return { state: "not-applicable" }
  if (slot.state !== "value") return EMPTY
  const resolved = resolveText(slot.value, locale)
  return {
    state: "plain",
    text: resolved.text,
    untranslated: fallbacks.note(resolved.untranslated),
  }
}

function prose(slot: Slot<TranslatedRichText>, locale: Locale, fallbacks: Fallbacks): FieldView {
  if (slot.state === "not-applicable") return { state: "not-applicable" }
  if (slot.state !== "value") return EMPTY
  const resolved = resolveRichText(slot.value, locale)
  return {
    state: "rich",
    text: resolved.text,
    untranslated: fallbacks.note(resolved.untranslated),
  }
}

function linksOf(slot: Slot<LocalizedLinks>, locale: Locale): Link[] {
  return slot.state === "value" ? resolveLinks(slot.value, locale) : []
}

function stringOf(slot: Slot<string>): string {
  return slot.state === "value" ? slot.value : ""
}

function valueField(
  value: ContentValue,
  locale: Locale,
  catalog: CatalogView,
  fallbacks: Fallbacks,
): FieldView {
  switch (value.kind) {
    case "text": {
      const resolved = resolveRichText(value.text, locale)
      return {
        state: "rich",
        text: resolved.text,
        untranslated: fallbacks.note(resolved.untranslated),
      }
    }
    case "single":
    case "accession":
      return { state: "plain", text: value.value, untranslated: false }
    case "vocabulary": {
      const labels = value.termIds
        .map((id) => catalog.termById.get(id))
        .filter((term) => term !== undefined)
        .map((term) => termLabel(term, locale))
      return { state: "plain", text: labels.join(locale === "ja" ? "、" : ", "), untranslated: false }
    }
    case "number":
      return {
        state: "plain",
        text: value.unit === null ? String(value.value) : `${value.value} ${value.unit}`,
        untranslated: false,
      }
  }
}

function slotField(
  slot: Slot<ContentValue>,
  locale: Locale,
  catalog: CatalogView,
  fallbacks: Fallbacks,
): FieldView {
  if (slot.state === "not-applicable") return { state: "not-applicable" }
  if (slot.state !== "value") return EMPTY
  return valueField(slot.value, locale, catalog, fallbacks)
}

export interface ValueView {
  keyId: string
  label: string
  field: FieldView
}

/** Catalog order, and only keys the catalog knows. */
function valueViews(
  values: ValueSlot[],
  locale: Locale,
  catalog: CatalogView,
  fallbacks: Fallbacks,
): ValueView[] {
  return values
    .flatMap((value) => {
      const key = catalog.keyById.get(value.keyId)
      if (key === undefined) return []
      return [{
        keyId: value.keyId,
        label: keyLabel(key, locale),
        field: slotField(value.slot, locale, catalog, fallbacks),
        position: key.position,
      }]
    })
    .sort((a, b) => a.position - b.position)
    .map(({ keyId, label, field }) => ({ keyId, label, field }))
}

function valueUnderCode(
  content: DatasetContent,
  catalog: CatalogView,
  code: string,
): Slot<ContentValue> | null {
  const key = catalog.keyByCode.get(code)
  if (key === undefined) return null
  return content.values.find((value) => value.keyId === key.id)?.slot ?? null
}

/**
 * The access type keeps its term code alongside its label: the badge is drawn
 * differently for unrestricted and controlled data, and the label is whatever
 * the catalog says in whichever language, so it cannot be matched against.
 */
export interface TermView {
  code: string
  label: string
}

export interface DatasetRowView {
  label: string
  accessType: TermView | null
  typeOfData: FieldView | null
  datePublished: string | null
}

export interface DatasetRowInput {
  label: string
  content: DatasetContent
  datePublished: string | null
}

function firstTerm(
  slot: Slot<ContentValue> | null,
  locale: Locale,
  catalog: CatalogView,
): TermView | null {
  if (slot?.state !== "value" || slot.value.kind !== "vocabulary") return null
  const [termId] = slot.value.termIds
  const term = termId === undefined ? undefined : catalog.termById.get(termId)
  return term === undefined ? null : { code: term.code, label: termLabel(term, locale) }
}

function datasetRowView(
  input: DatasetRowInput,
  locale: Locale,
  catalog: CatalogView,
  fallbacks: Fallbacks,
): DatasetRowView {
  const typeOfData = valueUnderCode(input.content, catalog, TYPE_OF_DATA_KEY)
  return {
    label: input.label,
    accessType: firstTerm(valueUnderCode(input.content, catalog, ACCESS_TYPE_KEY), locale, catalog),
    typeOfData: typeOfData === null ? null : slotField(typeOfData, locale, catalog, fallbacks),
    datePublished: input.datePublished,
  }
}

export interface CauInput {
  applicationId: string
  principalInvestigator: TranslatedText
  affiliation: TranslatedText
  country: string
  researchTitle: TranslatedText
  periodStart: string | null
  periodEnd: string | null
  datasetAccessions: string[]
}

export interface CauView extends Omit<CauInput, "principalInvestigator" | "affiliation" | "researchTitle"> {
  principalInvestigator: string
  affiliation: string
  researchTitle: string
}

/**
 * Upstream's languages, taken as they are. A usage record is not content: a
 * curator cannot edit it, so calling one of its languages untranslated would
 * name a defect nobody in the portal can fix. It is left out of the page's
 * untranslated notice for the same reason.
 */
function cauView(entry: CauInput, locale: Locale): CauView {
  return {
    ...entry,
    principalInvestigator: resolveText(entry.principalInvestigator, locale).text,
    affiliation: resolveText(entry.affiliation, locale).text,
    researchTitle: resolveText(entry.researchTitle, locale).text,
  }
}

export interface ResearchView {
  humLabel: string
  versionNumber: number
  versionLabel: string
  releaseDate: string
  isLatest: boolean
  latestVersionNumber: number
  untranslated: boolean
  title: FieldView
  summary: { aims: FieldView, methods: FieldView, targets: FieldView, links: Link[] }
  datasets: DatasetRowView[]
  dataProviders: { id: string, representative: FieldView, organization: FieldView }[]
  researchProjects: { id: string, name: FieldView, links: Link[] }[]
  grants: { id: string, title: FieldView, agency: FieldView, grantIds: string[] }[]
  relatedPublications: { id: string, title: string, doi: string, datasetLabels: string[] }[]
  cau: CauView[]
}

export interface ResearchViewInput {
  humLabel: string
  versionNumber: number
  releaseDate: string
  latestVersionNumber: number
  content: ResearchContent
  /** In the order the version lists them. */
  datasets: DatasetRowInput[]
  /** Dataset identity to primary label, for the publications that cite them. */
  datasetLabelById: ReadonlyMap<string, string>
  cau: CauInput[]
}

export function researchView(
  input: ResearchViewInput,
  locale: Locale,
  catalog: CatalogView,
): ResearchView {
  const fallbacks = fallbackTracker()
  const content = input.content
  const labelsOf = (ids: string[]): string[] =>
    ids.map((id) => input.datasetLabelById.get(id)).filter((label) => label !== undefined)

  return {
    humLabel: input.humLabel,
    versionNumber: input.versionNumber,
    versionLabel: `${input.humLabel}-v${input.versionNumber}`,
    releaseDate: input.releaseDate,
    isLatest: input.versionNumber === input.latestVersionNumber,
    latestVersionNumber: input.latestVersionNumber,
    title: translated(content.title, locale, fallbacks),
    summary: {
      aims: prose(content.summary.aims, locale, fallbacks),
      methods: prose(content.summary.methods, locale, fallbacks),
      targets: prose(content.summary.targets, locale, fallbacks),
      links: linksOf(content.summary.url, locale),
    },
    datasets: input.datasets.map((row) => datasetRowView(row, locale, catalog, fallbacks)),
    dataProviders: content.dataProviders.map((provider) => ({
      id: provider.id,
      representative: translated(provider.name, locale, fallbacks),
      organization: translated(provider.organization.name, locale, fallbacks),
    })),
    researchProjects: content.researchProjects.map((project) => ({
      id: project.id,
      name: translated(project.name, locale, fallbacks),
      links: linksOf(project.url, locale),
    })),
    grants: content.grants.map((grant) => ({
      id: grant.id,
      title: translated(grant.title, locale, fallbacks),
      agency: translated(grant.agency.name, locale, fallbacks),
      grantIds: grant.grantIds,
    })),
    relatedPublications: content.relatedPublications.map((publication) => ({
      id: publication.id,
      title: stringOf(publication.title),
      doi: stringOf(publication.doi),
      datasetLabels: labelsOf(publication.datasetIds),
    })),
    cau: input.cau.map((entry) => cauView(entry, locale)),
    // Read last: everything above has had its chance to fall back by now.
    untranslated: fallbacks.seen(),
  }
}

export interface ReleaseListView {
  humLabel: string
  untranslated: boolean
  versions: {
    number: number
    label: string
    releaseDate: string
    releaseNote: FieldView
    addedDatasetLabels: string[]
  }[]
}

export interface ReleaseListInput {
  humLabel: string
  /** Newest first. */
  versions: {
    number: number
    releaseDate: string
    content: ResearchContent
    addedDatasetIds: string[]
  }[]
  datasetLabelById: ReadonlyMap<string, string>
}

export function releaseListView(input: ReleaseListInput, locale: Locale): ReleaseListView {
  const fallbacks = fallbackTracker()
  const versions = input.versions.map((version) => ({
    number: version.number,
    label: `${input.humLabel}-v${version.number}`,
    releaseDate: version.releaseDate,
    releaseNote: prose(version.content.releaseNote, locale, fallbacks),
    addedDatasetLabels: version.addedDatasetIds
      .map((id) => input.datasetLabelById.get(id))
      .filter((label) => label !== undefined),
  }))
  return { humLabel: input.humLabel, versions, untranslated: fallbacks.seen() }
}

export interface DatasetView {
  label: string
  humLabel: string
  datePublished: string | null
  dateModified: string | null
  accessType: TermView | null
  typeOfData: FieldView | null
  untranslated: boolean
  experiments: { id: string, label: string, values: ValueView[] }[]
}

export interface DatasetViewInput {
  label: string
  humLabel: string
  content: DatasetContent
  datePublished: string | null
  dateModified: string | null
}

export function datasetView(
  input: DatasetViewInput,
  locale: Locale,
  catalog: CatalogView,
): DatasetView {
  const fallbacks = fallbackTracker()
  const row = datasetRowView(
    { label: input.label, content: input.content, datePublished: input.datePublished },
    locale,
    catalog,
    fallbacks,
  )
  const experiments = input.content.experiments.map((experiment) => ({
    id: experiment.id,
    label: stringOf(experiment.label),
    values: valueViews(experiment.values, locale, catalog, fallbacks),
  }))
  return {
    label: input.label,
    humLabel: input.humLabel,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    accessType: row.accessType,
    typeOfData: row.typeOfData,
    experiments,
    untranslated: fallbacks.seen(),
  }
}
