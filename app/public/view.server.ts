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

import type { CauUsage } from "~/content/public"
import type {
  ContentValue,
  DatasetContent,
  DiseaseValue,
  Link,
  LocalizedLinks,
  ResearchContent,
  RichText,
  Slot,
  TranslatedRichText,
  TranslatedText,
  ValueSlot,
  NumberValue,
} from "~/content/types"
import { catalogLabel } from "~/i18n/catalog-label"
import {
  resolveBilingual,
  resolveLinks,
  resolveRichText,
  resolveText,
  type Locale,
  type Resolved,
} from "~/i18n/locale"

/**
 * A value as a page shows it. `unsettled` only ever reaches a screen through a
 * preview: the public projection turns an unsettled value into an empty one
 * before it gets here, and a preview keeps it precisely so the frame stays
 * visible with the question attached to it.
 */
/**
 * One number as a reader sees it: what it is about, the number itself with its
 * unit, and whatever qualifies it. Each part is dropped when it is absent, so a
 * key holding a single bare number still reads as that number and nothing else.
 */
export function writtenNumber(number: NumberValue): string {
  // **What was typed, not what was stored.** The canonical unit exists so that
  // a range can be asked of the key at all; nobody wrote `1351.68 GB`, they
  // wrote `1.32 TB`, and showing the conversion back to them is the page
  // answering a question about its own storage.
  const value = number.inputValue
  const unit = number.inputUnit
  // Figures are compared by eye down a column, and six digits without a break
  // in them cannot be. **A fold and a percentage close up against the number**
  // — `30x`, `98%` — where a unit that is a word takes a space.
  const shown = Math.abs(value) >= 10_000 ? value.toLocaleString("en-US") : String(value)
  const said = unit === null
    ? shown
    : `${shown}${/^[x×%倍]$/i.test(unit) ? "" : " "}${unit}`
  const named = number.label === null ? said : `${number.label}: ${said}`
  return number.note === null ? named : `${named} (${number.note})`
}

export type FieldView
  = | { state: "not-applicable" }
    | { state: "unsettled" }
    | { state: "rich", text: RichText, untranslated: boolean }
    | { state: "plain", text: string, untranslated: boolean }

/**
 * Links as a page shows them. A URL is the one kind of value whose two
 * languages are different resources rather than translations, so it never falls
 * back — but it carries the same four states as everything else, and both
 * `unsettled` and `not-applicable` have to survive the trip to the screen.
 * Collapsing them into an empty list is what would make a preview stop asking.
 */
export type LinksView = Resolved<Link[]>

/**
 * One place a page draws, kept under the anchor it draws it at.
 *
 * The anchors are the path vocabulary of the editing form, which is what makes
 * three separate things line up on one spelling: where a comment is attached,
 * which fields a diff reports, and where on the page either of them belongs.
 * The map is built by the same walk that builds the view, so it cannot drift
 * from it — what it has to agree with is the set of anchors the components draw,
 * and that agreement is a test.
 */
export type AnchoredValue
  = | { kind: "field", field: FieldView }
    | { kind: "links", links: LinksView }
    | { kind: "list", items: string[] }
    | { kind: "term", term: TermView | null }

export interface Anchored<T> {
  view: T
  byAnchor: Record<string, AnchoredValue>
}

interface Anchors {
  field: (at: string, field: FieldView) => FieldView
  links: (at: string, links: LinksView) => LinksView
  list: (at: string, items: string[]) => string[]
  term: (at: string, term: TermView | null) => TermView | null
  taken: () => Record<string, AnchoredValue>
}

function anchorRecorder(): Anchors {
  const taken: Record<string, AnchoredValue> = {}
  function keep<T>(at: string, value: AnchoredValue, held: T): T {
    taken[at] = value
    return held
  }
  return {
    field: (at, field) => keep(at, { kind: "field", field }, field),
    links: (at, links) => keep(at, { kind: "links", links }, links),
    list: (at, items) => keep(at, { kind: "list", items }, items),
    term: (at, term) => keep(at, { kind: "term", term }, term),
    taken: () => taken,
  }
}

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
  /** Who makes the thing this names, where the value is a product. */
  maker: string | null
  /**
   * Where the value sits among the others under its key. It is what the
   * catalog orders a key's values by, and the only order a cell holding
   * several of them has: the rows come back from the search tables in no
   * order at all.
   */
  position: number
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

/**
 * The key the research listing gives a column of its own. It is scoped to the
 * experiment rather than to the research, so what a study "runs on" is the
 * union of what the experiments beneath it carry — which is why the listing
 * reads it from the facet rows and not from the research's own content.
 */
export const PLATFORM_KEY = "platform"

/** A value as one line of text, for saying what a list used to hold. */
export function fieldText(field: FieldView): string {
  if (field.state === "plain") return field.text
  if (field.state === "rich") return field.text.map((line) => line.map((span) => span.text).join("")).join(" ")
  return ""
}

/**
 * Where a value under a catalog key is anchored. The two keys the dataset page
 * places itself are still values in a list, so they anchor like the rest.
 */
export function anchorUnderCode(catalog: CatalogView, code: string): string | null {
  const key = catalog.keyByCode.get(code)
  return key === undefined ? null : `values.${key.id}`
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

function translated(pair: TranslatedText, locale: Locale, fallbacks: Fallbacks): FieldView {
  const resolved = resolveText(pair, locale)
  if (resolved.state !== "value") return { state: resolved.state }
  return {
    state: "plain",
    text: resolved.value,
    untranslated: fallbacks.note(resolved.untranslated),
  }
}

function prose(pair: TranslatedRichText, locale: Locale, fallbacks: Fallbacks): FieldView {
  const resolved = resolveRichText(pair, locale)
  if (resolved.state !== "value") return { state: resolved.state }
  return {
    state: "rich",
    text: resolved.value,
    untranslated: fallbacks.note(resolved.untranslated),
  }
}

function linksOf(pair: LocalizedLinks, locale: Locale): LinksView {
  return resolveLinks(pair, locale)
}

/** A single-language value, which is settled or not on its own. */
function plainOf(slot: Slot<string>): FieldView {
  if (slot.state === "not-applicable") return { state: "not-applicable" }
  if (slot.state === "unknown") return { state: "unsettled" }
  return { state: "plain", text: slot.value, untranslated: false }
}

/**
 * A disease as the page shows it: **the name the article wrote, and the code
 * after it in brackets.**
 *
 * The name falls back to the other language before it falls back to the
 * classification, because a name written in one language only is what the
 * article had — dropping to the heading would put a word on the page that
 * nobody wrote. **No code means no brackets**: a disease no classification
 * names is an ordinary value (`docs/public-pages.md` の「dataset」).
 */
function writtenDisease(disease: DiseaseValue, locale: Locale, catalog: CatalogView): string {
  const terms = disease.termIds
    .map((id) => catalog.termById.get(id))
    .filter((term) => term !== undefined)
  const written = (locale === "ja" ? disease.nameJa : disease.nameEn)
    ?? (locale === "ja" ? disease.nameEn : disease.nameJa)
    ?? (terms[0] === undefined ? null : catalogLabel(terms[0], locale))
  const codes = terms.map((term) => term.code).join(", ")
  if (written === null) return codes
  return codes === "" ? written : `${written} (${codes})`
}

/**
 * The state of a value lives inside it: prose holds one per language and
 * resolves like any other translated pair, everything else holds a single one.
 */
function valueField(
  value: ContentValue,
  locale: Locale,
  catalog: CatalogView,
  fallbacks: Fallbacks,
): FieldView {
  switch (value.kind) {
    case "text":
      return prose(value.text, locale, fallbacks)
    case "single":
    case "accession":
      return plainOf(value.value)
    case "vocabulary": {
      const slot = value.termIds
      if (slot.state === "not-applicable") return { state: "not-applicable" }
      if (slot.state === "unknown") return { state: "unsettled" }
      // Catalog order, for the reason `termViews` gives: the ids themselves
      // carry none, and a key holding several values is read down a column
      // beside the same key on other pages.
      const labels = slot.value
        .map((id) => catalog.termById.get(id))
        .filter((term) => term !== undefined)
        .sort((a, b) => a.position - b.position || a.code.localeCompare(b.code, "en"))
        .map((term) => catalogLabel(term, locale))
      return { state: "plain", text: labels.join(locale === "ja" ? "、" : ", "), untranslated: false }
    }
    case "disease": {
      if (value.diseases.state === "not-applicable") return { state: "not-applicable" }
      if (value.diseases.state === "unknown") return { state: "unsettled" }
      // A line each, like the numbers: a name with a code after it is a phrase,
      // and running several together makes the brackets unreadable.
      return {
        state: "rich",
        text: value.diseases.value.map((one) => [{ text: writtenDisease(one, locale, catalog) }]),
        untranslated: false,
      }
    }
    case "number": {
      if (value.values.state === "not-applicable") return { state: "not-applicable" }
      if (value.values.state === "unknown") return { state: "unsettled" }
      // A line each, because that is what they are: a key holding several
      // numbers holds several facts, and running them together makes one
      // sentence out of readings taken separately.
      return {
        state: "rich",
        text: value.values.value.map((number) => [{ text: writtenNumber(number) }]),
        untranslated: false,
      }
    }
  }
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
        label: catalogLabel(key, locale),
        field: valueField(value.value, locale, catalog, fallbacks),
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
): ContentValue | null {
  const key = catalog.keyByCode.get(code)
  if (key === undefined) return null
  return content.values.find((value) => value.keyId === key.id)?.value ?? null
}

/**
 * The access type keeps its term code alongside its label: the badge is drawn
 * differently for unrestricted and controlled data, and the label is whatever
 * the catalog says in whichever language, so it cannot be matched against.
 */
export interface TermView {
  code: string
  label: string
  /**
   * The part of the label naming who made the thing, drawn apart from the rest
   * (`TermLabel`). Null on everything that is not a product, and on a label
   * that has been renamed to no longer begin with it.
   */
  maker: string | null
}

export interface DatasetRowView {
  /**
   * The identity, when the caller has one. A listing is built from search rows
   * and has only labels; a version's own table has the identities it lists, and
   * a preview needs them because a draft's datasets may have no label pinned yet.
   */
  id: string | null
  label: string
  accessType: TermView | null
  typeOfData: FieldView | null
  datePublished: string | null
}

export interface DatasetRowInput {
  id: string | null
  label: string
  content: DatasetContent
  datePublished: string | null
}

function firstTerm(
  value: ContentValue | null,
  locale: Locale,
  catalog: CatalogView,
): TermView | null {
  if (value?.kind !== "vocabulary" || value.termIds.state !== "value") return null
  const [termId] = value.termIds.value
  const term = termId === undefined ? undefined : catalog.termById.get(termId)
  return term === undefined ? null : termView(term, locale)
}

function datasetRowView(
  input: DatasetRowInput,
  locale: Locale,
  catalog: CatalogView,
  fallbacks: Fallbacks,
): DatasetRowView {
  const typeOfData = valueUnderCode(input.content, catalog, TYPE_OF_DATA_KEY)
  return {
    id: input.id,
    label: input.label,
    accessType: firstTerm(valueUnderCode(input.content, catalog, ACCESS_TYPE_KEY), locale, catalog),
    typeOfData: typeOfData === null ? null : valueField(typeOfData, locale, catalog, fallbacks),
    datePublished: input.datePublished,
  }
}

/**
 * A usage record with one language chosen. The record itself is `CauUsage`
 * (`app/content/public.ts`) — the pages and the JSON API read the same rows, so
 * there is one shape for them and this is only what a page does to it.
 */
export interface CauView extends Omit<CauUsage, "principalInvestigator" | "affiliation" | "researchTitle"> {
  principalInvestigator: string
  affiliation: string
  researchTitle: string
}

/**
 * Upstream's languages, taken as they are. A usage record is not content: a
 * curator cannot edit it, so calling one of its languages untranslated would
 * name a defect nobody in the portal can fix. It carries no state either, which
 * is why it resolves through its own function.
 */
function cauView(entry: CauUsage, locale: Locale): CauView {
  return {
    ...entry,
    principalInvestigator: resolveBilingual(entry.principalInvestigator, locale),
    affiliation: resolveBilingual(entry.affiliation, locale),
    researchTitle: resolveBilingual(entry.researchTitle, locale),
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
  /**
   * What this version says it changed. **The published pages do not draw it** —
   * it belongs to the release list, where the versions are read against each
   * other — but a preview does, because the note is part of what the provider
   * is being asked to check and there is no release list under a share link.
   */
  releaseNote: FieldView
  summary: { aims: FieldView, methods: FieldView, targets: FieldView, links: LinksView }
  datasets: DatasetRowView[]
  dataProviders: { id: string, representative: FieldView, organization: FieldView }[]
  researchProjects: { id: string, name: FieldView, links: LinksView }[]
  grants: { id: string, title: FieldView, agency: FieldView, grantIds: string[] }[]
  relatedPublications: { id: string, title: FieldView, doi: FieldView, datasetLabels: string[] }[]
  cau: CauView[]
  /**
   * The research's box, as the caller listed and paged it. It is not part of
   * the content and carries no anchor: nobody edits it, and a comment about a
   * file would have nothing in the draft to attach to.
   */
  files: FileListView
}

/** One line of the download list. `isPublic` is false only inside a preview. */
export interface FileRowView {
  name: string
  size: number
  isPublic: boolean
}

/**
 * One page of a box. **The cut is made before the view is built**, because it
 * is a property of the listing rather than of the research, and the largest box
 * would otherwise be a megabyte of HTML.
 */
export interface FileListView {
  rows: FileRowView[]
  total: number
  page: number
  pageCount: number
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
  cau: CauUsage[]
  files: FileListView
}

export function researchView(
  input: ResearchViewInput,
  locale: Locale,
  catalog: CatalogView,
): ResearchView {
  return anchoredResearchView(input, locale, catalog).view
}

/**
 * The same view, with every place it draws kept under its anchor. A public page
 * takes the view alone; a preview takes both, because it has comments to hang
 * and a published version to show the previous value from.
 */
export function anchoredResearchView(
  input: ResearchViewInput,
  locale: Locale,
  catalog: CatalogView,
): Anchored<ResearchView> {
  const fallbacks = fallbackTracker()
  const at = anchorRecorder()
  const content = input.content
  const labelsOf = (ids: string[]): string[] =>
    ids.map((id) => input.datasetLabelById.get(id)).filter((label) => label !== undefined)

  const datasets = input.datasets.map((row) => datasetRowView(row, locale, catalog, fallbacks))
  at.list("datasetIds", datasets.map((row) => row.label))

  const view: ResearchView = {
    humLabel: input.humLabel,
    versionNumber: input.versionNumber,
    versionLabel: `${input.humLabel}-v${input.versionNumber}`,
    releaseDate: input.releaseDate,
    isLatest: input.versionNumber === input.latestVersionNumber,
    latestVersionNumber: input.latestVersionNumber,
    title: at.field("title", translated(content.title, locale, fallbacks)),
    releaseNote: at.field("releaseNote", prose(content.releaseNote, locale, fallbacks)),
    summary: {
      aims: at.field("summary.aims", prose(content.summary.aims, locale, fallbacks)),
      methods: at.field("summary.methods", prose(content.summary.methods, locale, fallbacks)),
      targets: at.field("summary.targets", prose(content.summary.targets, locale, fallbacks)),
      links: at.links("summary.url", linksOf(content.summary.url, locale)),
    },
    datasets,
    dataProviders: content.dataProviders.map((provider) => ({
      id: provider.id,
      representative: at.field(
        `dataProviders.${provider.id}.name`,
        translated(provider.name, locale, fallbacks),
      ),
      organization: at.field(
        `dataProviders.${provider.id}.organization.name`,
        translated(provider.organization.name, locale, fallbacks),
      ),
    })),
    researchProjects: content.researchProjects.map((project) => ({
      id: project.id,
      name: at.field(
        `researchProjects.${project.id}.name`,
        translated(project.name, locale, fallbacks),
      ),
      links: at.links(`researchProjects.${project.id}.url`, linksOf(project.url, locale)),
    })),
    grants: content.grants.map((grant) => ({
      id: grant.id,
      title: at.field(`grants.${grant.id}.title`, translated(grant.title, locale, fallbacks)),
      agency: at.field(
        `grants.${grant.id}.agency.name`,
        translated(grant.agency.name, locale, fallbacks),
      ),
      grantIds: at.list(`grants.${grant.id}.grantIds`, grant.grantIds),
    })),
    relatedPublications: content.relatedPublications.map((publication) => ({
      id: publication.id,
      title: at.field(`relatedPublications.${publication.id}.title`, plainOf(publication.title)),
      doi: at.field(`relatedPublications.${publication.id}.doi`, plainOf(publication.doi)),
      datasetLabels: at.list(
        `relatedPublications.${publication.id}.datasetIds`,
        labelsOf(publication.datasetIds),
      ),
    })),
    cau: input.cau.map((entry) => cauView(entry, locale)),
    files: input.files,
    // Read last: everything above has had its chance to fall back by now.
    untranslated: fallbacks.seen(),
  }

  // An array carries its own path for membership and order, so each list is
  // anchored as a whole as well: an element added or taken away is a change
  // nobody could see if only the surviving elements were anchored.
  at.list("dataProviders", view.dataProviders.map((row) => fieldText(row.representative)))
  at.list("researchProjects", view.researchProjects.map((row) => fieldText(row.name)))
  at.list("grants", view.grants.map((row) => fieldText(row.title)))
  at.list("relatedPublications", view.relatedPublications.map((row) => fieldText(row.title)))

  return { view, byAnchor: at.taken() }
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
  /**
   * The JGA study this dataset sits under, for a dataset registered there.
   * It comes from the upstream cache rather than from content, so a dataset
   * the portal itself issued an id for does not have one.
   */
  studyAccession: string | null
  datePublished: string | null
  dateModified: string | null
  accessType: TermView | null
  typeOfData: FieldView | null
  untranslated: boolean
  experiments: { id: string, label: FieldView, values: ValueView[] }[]
  /**
   * What this dataset selects out of its research's box, in the order it
   * selects it. Already narrowed to what the listing holds, so a selection
   * naming something absent is simply not here.
   */
  files: FileRowView[]
}

export interface DatasetViewInput {
  label: string
  humLabel: string
  studyAccession: string | null
  content: DatasetContent
  datePublished: string | null
  dateModified: string | null
  /** The research's box, which the selection is read against. */
  files: FileRowView[]
}

export function datasetView(
  input: DatasetViewInput,
  locale: Locale,
  catalog: CatalogView,
): DatasetView {
  return anchoredDatasetView(input, locale, catalog).view
}

/**
 * A dataset's anchors are the paths of the dataset form: a value the dataset
 * itself carries is under the catalog key it sits under, and an experiment's
 * values are under the experiment's identity. The two keys the page places
 * itself are anchored the same way, because a comment about the access type is
 * a comment about that value slot however the page chose to draw it.
 */
export function anchoredDatasetView(
  input: DatasetViewInput,
  locale: Locale,
  catalog: CatalogView,
): Anchored<DatasetView> {
  const fallbacks = fallbackTracker()
  const at = anchorRecorder()
  const row = datasetRowView(
    { id: null, label: input.label, content: input.content, datePublished: input.datePublished },
    locale,
    catalog,
    fallbacks,
  )

  const accessAnchor = anchorUnderCode(catalog, ACCESS_TYPE_KEY)
  if (accessAnchor !== null) at.term(accessAnchor, row.accessType)
  const typeAnchor = anchorUnderCode(catalog, TYPE_OF_DATA_KEY)
  if (typeAnchor !== null && row.typeOfData !== null) at.field(typeAnchor, row.typeOfData)

  const experiments = input.content.experiments.map((experiment) => ({
    id: experiment.id,
    label: at.field(`experiments.${experiment.id}.label`, plainOf(experiment.label)),
    values: valueViews(experiment.values, locale, catalog, fallbacks).map((value) =>
      ({ ...value, field: at.field(`experiments.${experiment.id}.values.${value.keyId}`, value.field) })),
  }))

  at.list("experiments", experiments.map((row) => fieldText(row.label)))

  const view: DatasetView = {
    label: input.label,
    humLabel: input.humLabel,
    studyAccession: input.studyAccession,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    accessType: row.accessType,
    typeOfData: row.typeOfData,
    experiments,
    files: selectedFiles(input.content.fileSelection, input.files),
    untranslated: fallbacks.seen(),
  }
  return { view, byAnchor: at.taken() }
}

/**
 * The selection, in the order the dataset holds it, keeping only what the
 * listing has. The projection has already dropped the rest, so this is the same
 * rule applied a second time — and what makes the second application harmless
 * is that both read the one listing.
 */
function selectedFiles(
  selection: readonly string[],
  listing: readonly FileRowView[],
): FileRowView[] {
  const byName = new Map(listing.map((row) => [row.name, row]))
  return selection.flatMap((name) => {
    const row = byName.get(name)
    return row === undefined ? [] : [row]
  })
}

/**
 * A row of one of the two listings.
 *
 * The listings do not carry the untranslated notice. It is a statement about a
 * page — "what you are reading is not fully translated" — and a table of twenty
 * rows drawn from twenty different records has no single answer to give.
 */
export interface ResearchListRowView {
  humLabel: string
  datasetLabels: string[]
  title: FieldView
  methods: FieldView
  typeOfData: FieldView
  platforms: TermView[]
  targets: FieldView
  accessTypes: TermView[]
  /**
   * The representative of each provider, and not the organisation beside it.
   * The research page carries both under one heading; a cell in a listing holds
   * a line, and the name is the half a reader scans for.
   */
  dataProviders: FieldView[]
  datePublished: string | null
  dateModified: string | null
}

export interface ResearchListRowInput {
  humLabel: string
  content: ResearchContent
  /** In the order the version lists them, already resolved to labels. */
  datasetLabels: string[]
  /** Distinct access types across the research's published datasets. */
  accessTermIds: string[]
  /** Distinct platforms across the same datasets. */
  platformTermIds: string[]
  datePublished: string | null
  dateModified: string | null
}

/**
 * The order a list of accession labels reads in. **Numbers in them count as
 * numbers**, so that `JGAD000290` comes before `JGAD000363` and `hum0014.v2`
 * before `hum0014.v10`. The order a study's datasets reach us in is the order
 * someone entered them in a form, which is not an order anyone chose.
 */
const BY_LABEL = new Intl.Collator("en", { numeric: true })

export function researchListRowView(
  input: ResearchListRowInput,
  locale: Locale,
  catalog: CatalogView,
): ResearchListRowView {
  const fallbacks = fallbackTracker()
  const short = input.content.listingSummary
  return {
    humLabel: input.humLabel,
    datasetLabels: [...input.datasetLabels].sort((a, b) => BY_LABEL.compare(a, b)),
    title: translated(input.content.title, locale, fallbacks),
    methods: prose(short.methods, locale, fallbacks),
    typeOfData: prose(short.typeOfData, locale, fallbacks),
    platforms: termViews(input.platformTermIds, locale, catalog),
    targets: prose(short.targets, locale, fallbacks),
    accessTypes: termViews(input.accessTermIds, locale, catalog),
    dataProviders: input.content.dataProviders.map((provider) =>
      translated(provider.name, locale, fallbacks)),
    datePublished: input.datePublished,
    dateModified: input.dateModified,
  }
}

/**
 * A term as a page draws it. **The maker is only carried where the label still
 * starts with it** — a curator who renames `Illumina NovaSeq 6000` to something
 * else has said the two are no longer a prefix and a rest, and drawing them
 * apart would then cut the label in the wrong place.
 */
function termView(term: VocabularyTermView, locale: Locale): TermView {
  const label = catalogLabel(term, locale)
  return { code: term.code, label, maker: makerOf(term.maker, label) }
}

/**
 * The maker a label is drawn apart from, or null where there is nothing to
 * take apart. **A renamed label keeps its maker whole** — the two are a prefix
 * and a rest only while the label still opens with it.
 */
export function makerOf(maker: string | null, label: string): string | null {
  return maker !== null && maker !== "" && label.startsWith(maker) ? maker : null
}

/**
 * The terms the catalog still knows, in the order the catalog keeps them.
 *
 * **Not the order they arrived in.** The ids come out of the search tables with
 * no ordering at all, and a cell shows only its first few values before
 * counting the rest — left alone, which values a reader sees would be an
 * accident of how the rows came back, and need not survive the next request.
 */
function termViews(termIds: readonly string[], locale: Locale, catalog: CatalogView): TermView[] {
  return termIds
    .flatMap((id) => {
      const term = catalog.termById.get(id)
      return term === undefined ? [] : [term]
    })
    .sort((a, b) => a.position - b.position || a.code.localeCompare(b.code, "en"))
    .map((term) => termView(term, locale))
}

export interface DatasetListRowView extends DatasetRowView {
  humLabel: string
  dateModified: string | null
  /**
   * What the dataset's experiments are called.
   *
   * **Free text rather than terms.** The label is the line above the table in
   * the source article (`Experiment`), and the listing carries it because that
   * line is how a reader tells one dataset's work from another's. The
   * controlled values describing the same work sit under catalog keys and are
   * what the refinement panel counts.
   *
   * **Distinct, and in the order the dataset lists them** — a dataset that ran
   * the same assay twice names it once, and the order is the one a curator put
   * the experiments in.
   */
  experimentLabels: string[]
}

export interface DatasetListRowInput extends DatasetRowInput {
  humLabel: string
  dateModified: string | null
}

export function datasetListRowView(
  input: DatasetListRowInput,
  locale: Locale,
  catalog: CatalogView,
): DatasetListRowView {
  const row = datasetRowView(input, locale, catalog, fallbackTracker())
  return {
    ...row,
    humLabel: input.humLabel,
    dateModified: input.dateModified,
    experimentLabels: [...new Set(input.content.experiments.flatMap((experiment) =>
      experiment.label.state === "value" && experiment.label.value !== ""
        ? [experiment.label.value]
        : []))],
  }
}
