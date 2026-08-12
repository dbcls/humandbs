/**
 * Turning content into what the outside is allowed to see.
 *
 * One function serves both the public page and the preview behind a share
 * link; the only difference is `keepUnsettled`, and the public route has no way
 * to pass it. Keeping the two on one path is what makes "the provider is
 * looking at the page as it will be published" true by construction.
 *
 * **This only ever drops.** Field names, structure and value representation are
 * left alone, which is why the return type is the content type itself: content
 * is the public shape plus what only editing needs. A narrower published-only
 * type would fork the shape the public page, the review screen and the editor
 * each receive, and the same rendering would be written three times.
 *
 * What is dropped:
 *
 * - unsettled slots, unless `keepUnsettled`. A preview keeps them because the
 *   first use of a share link is asking a provider to fill exactly those in;
 *   showing the published face would hide the question. `not-applicable` is
 *   settled information and survives either way
 * - value slots under a catalog key that is not shown on the public page, and
 *   under a key the catalog does not know at all
 * - file selections naming something the listing does not contain. The listing
 *   is the only source for what exists, so a stale selection renders as nothing
 *
 * Everything else the public page needs — who has used the data, what the
 * bucket holds, when an archived accession was released — is not in the content
 * and is passed in. **The function never reaches for it itself**: fetching here
 * would put an external system's availability in the render path.
 */

import type {
  Bilingual,
  ContentValue,
  DatasetContent,
  LocalizedLinks,
  ResearchContent,
  Slot,
  TranslatedRichText,
  TranslatedText,
  ValueSlot,
} from "./types"

export interface PublicOptions {
  /**
   * Keep slots whose value has not been settled. False for every public route —
   * the option is not reachable from one.
   */
  keepUnsettled: boolean
}

/**
 * How every public route derives, named once so that "the public side never
 * keeps an unsettled value" is a single thing rather than a literal repeated
 * wherever a projection is taken. **The preview says otherwise**, and that is
 * the whole reason the option exists: a shared link is for asking a provider to
 * settle what is unsettled, so it is the one place the question survives.
 */
export const PUBLISHED: PublicOptions = { keepUnsettled: false }

/**
 * What the public side needs to know about a catalog key. Only the flag is read
 * here: labels are resolved and keys are ordered where they are rendered, since
 * doing either would add something the content does not hold.
 */
export interface CatalogKey {
  id: string
  showOnPublicPage: boolean
}

/**
 * One usage of a research's controlled-access data, from the cache of the
 * application system. Not content: curators cannot edit it, and its two
 * languages are whatever upstream has, so it is never counted as untranslated.
 *
 * **The usage project it came from is not here** — that is how the cached row
 * is matched to upstream, not something the portal publishes
 * (docs/data-model.md の「外部キャッシュ」).
 */
export interface CauUsage {
  principalInvestigator: Bilingual
  affiliation: Bilingual
  /** Upstream holds this in English only. */
  country: string
  researchTitle: Bilingual
  periodStart: string | null
  periodEnd: string | null
  datasetAccessions: string[]
}

/** One node of a listed bucket. The download list is this listing, unaltered. */
export interface StoredFile {
  name: string
  size: number
}

/** Dates of an accession registered in an external archive, as the archive has them. */
export interface ArchiveDates {
  datePublished: string | null
  dateModified: string | null
}

export interface PublicResearch {
  content: ResearchContent
  cau: CauUsage[]
  /**
   * The research's bucket as listed by the caller. A public page passes the
   * public bucket; a preview passes what an admin sees, because at draft time
   * nothing has been made public yet and the list would otherwise be empty.
   */
  files: StoredFile[]
}

export interface PublicDataset {
  content: DatasetContent
  /**
   * The dates to show. An NHA ID carries its own release date in the content
   * because no archive has one; everything else takes the archive's values
   * unchanged. Resolving which of the two applies happens here so that nothing
   * downstream has to decide it again — `content.releaseDate` is the admin's
   * input, not the answer.
   */
  dates: ArchiveDates
}

/**
 * An unsettled value becomes an empty one, which is how it disappears from the
 * page: the shape is the content type itself, so there is nothing to omit.
 */
function settle<T>(slot: Slot<T>, empty: T, options: PublicOptions): Slot<T> {
  return slot.state === "unknown" && !options.keepUnsettled
    ? { state: "value", value: empty }
    : slot
}

/**
 * A translated pair holds a state per language, so each side settles on its own
 * — a title that is settled in Japanese and still a question in English
 * publishes the Japanese and falls back for the English, exactly as an
 * untranslated field does.
 */
function text(pair: TranslatedText, options: PublicOptions): TranslatedText {
  return { ja: settle(pair.ja, "", options), en: settle(pair.en, "", options) }
}

function rich(pair: TranslatedRichText, options: PublicOptions): TranslatedRichText {
  return { ja: settle(pair.ja, [], options), en: settle(pair.en, [], options) }
}

function single(slot: Slot<string>, options: PublicOptions): Slot<string> {
  return settle(slot, "", options)
}

function links(pair: LocalizedLinks, options: PublicOptions): LocalizedLinks {
  return { ja: settle(pair.ja, [], options), en: settle(pair.en, [], options) }
}

/**
 * Each field is named rather than walked, so adding one to the content type
 * fails to compile until it has been decided what the public side does with it.
 */
export function publicResearchContent(
  content: ResearchContent,
  options: PublicOptions,
): ResearchContent {
  return {
    title: text(content.title, options),
    summary: {
      aims: rich(content.summary.aims, options),
      methods: rich(content.summary.methods, options),
      targets: rich(content.summary.targets, options),
      url: links(content.summary.url, options),
    },
    summaryShort: {
      methods: rich(content.summaryShort.methods, options),
      targets: rich(content.summaryShort.targets, options),
      typeOfData: rich(content.summaryShort.typeOfData, options),
    },
    releaseNote: rich(content.releaseNote, options),
    dataProviders: content.dataProviders.map((provider) => ({
      id: provider.id,
      name: text(provider.name, options),
      organization: {
        name: text(provider.organization.name, options),
        address: text(provider.organization.address, options),
      },
      orcid: single(provider.orcid, options),
      email: single(provider.email, options),
    })),
    researchProjects: content.researchProjects.map((project) => ({
      id: project.id,
      name: text(project.name, options),
      url: links(project.url, options),
    })),
    grants: content.grants.map((grant) => ({
      id: grant.id,
      title: text(grant.title, options),
      agency: { name: text(grant.agency.name, options) },
      grantIds: [...grant.grantIds],
    })),
    relatedPublications: content.relatedPublications.map((publication) => ({
      id: publication.id,
      title: single(publication.title, options),
      doi: single(publication.doi, options),
      datasetIds: [...publication.datasetIds],
    })),
    datasetIds: [...content.datasetIds],
  }
}

/**
 * The state of a value that is not prose sits on the value itself, so an
 * unsettled one takes its whole slot with it. Prose holds a state per language,
 * and only the unsettled language empties — the other one is still published.
 */
function publicValue(value: ContentValue, options: PublicOptions): ContentValue | null {
  if (value.kind === "text") return { kind: "text", text: rich(value.text, options) }
  if (options.keepUnsettled) return value
  const state = value.kind === "vocabulary" ? value.termIds.state : value.value.state
  return state === "unknown" ? null : value
}

/**
 * A slot under a key the catalog does not know is dropped: without the catalog
 * there is nothing that says it may be shown, and the safe reading of an
 * unknown key is that it may not.
 */
function publicValues(
  values: ValueSlot[],
  keys: ReadonlyMap<string, CatalogKey>,
  options: PublicOptions,
): ValueSlot[] {
  return values.flatMap((slot) => {
    if (!keys.get(slot.keyId)?.showOnPublicPage) return []
    const value = publicValue(slot.value, options)
    return value === null ? [] : [{ keyId: slot.keyId, value }]
  })
}

export function publicDatasetContent(
  content: DatasetContent,
  input: { keys: ReadonlyMap<string, CatalogKey>, files: readonly StoredFile[] },
  options: PublicOptions,
): DatasetContent {
  const listed = new Set(input.files.map((file) => file.name))
  return {
    releaseDate: content.releaseDate,
    fileSelection: content.fileSelection.filter((name) => listed.has(name)),
    values: publicValues(content.values, input.keys, options),
    experiments: content.experiments.map((experiment) => ({
      id: experiment.id,
      label: single(experiment.label, options),
      values: publicValues(experiment.values, input.keys, options),
    })),
  }
}

export function publicResearch(
  content: ResearchContent,
  input: { cau: readonly CauUsage[], files: readonly StoredFile[] },
  options: PublicOptions,
): PublicResearch {
  return {
    content: publicResearchContent(content, options),
    cau: [...input.cau],
    files: [...input.files],
  }
}

export function publicDataset(
  content: DatasetContent,
  input: {
    keys: ReadonlyMap<string, CatalogKey>
    files: readonly StoredFile[]
    archive: ArchiveDates | null
  },
  options: PublicOptions,
): PublicDataset {
  return {
    content: publicDatasetContent(content, input, options),
    dates: {
      datePublished: content.releaseDate ?? input.archive?.datePublished ?? null,
      dateModified: input.archive?.dateModified ?? null,
    },
  }
}
