/**
 * The production migration: v1 production, frozen as a snapshot, into v2.
 *
 * Unlike the development load (`run.ts`) it loads everything the snapshot
 * holds rather than only what is published — the drafts too, with the datasets
 * they list — and it corrects what v1 lost or merged on the way:
 *
 * - a dataset's table values and type of data are built from the cell of its
 *   research's page in the old portal that has the same words, as the page
 *   wrote them (`research-pages.ts`); v1 rewrote the brackets, colons and line
 *   breaks of the text it kept. So are the research's own prose and single-line
 *   values, from the stretch of its page or its release note with the same
 *   words, and its listing summary, from the cell of the old listing, where
 *   v1's value is what v1 made of them;
 * - elsewhere the line breaks and links v1's extracted text dropped are
 *   recovered from the HTML it was extracted from, where the two still agree
 *   (`richtext-html.ts`), and from the old portal's articles, where a one-line
 *   value has the same text as a block the articles showed on several lines
 *   (`line-breaks.ts`);
 * - the research v1 never took in are added, and a test research is left out
 *   (`prepare.ts`);
 * - cells v1 read wrongly out of the articles are put right by hand
 *   (`cell-edits.ts`), and experiment keys are renamed, merged and dropped by a
 *   reviewed table and by the rebuilt catalog, which gives the order and the
 *   labels (`catalog-plan.ts`);
 * - the research's titles, whose lines the old listing broke for the width of
 *   its column, and what reads wrongly once the clean-ups are made are put
 *   right by hand (`text-edits.ts`);
 * - a block that several datasets share word for word is divided among them
 *   (`inversion.ts`);
 * - the listing's provider column has the programme each research was
 *   funded under, as the old site's listing did;
 * - a curator's question written into a draft's value becomes an unsettled
 *   value with the question as a comment on it (`requests.ts`);
 * - links whose destination has gone follow a hand-made table to where it went,
 *   or are taken off (`links.ts`), and a value that is only `NA` becomes
 *   not-applicable (`not-applicable.ts`);
 * - the datasets v1 named after their research are given NHA ids, keeping the
 *   old names as secondary labels (`nha.ts`), and start with the files their
 *   old pages and names pointed at selected.
 *
 * The research and datasets it makes take identities derived from their
 * labels (`identity.ts`), so loading again gives back the same ones and the
 * private files keyed by them stay where they are.
 *
 * Run once against an empty database. What no rule could settle is written to
 * `input/l12/out/` for somebody to work through on the loaded data.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { sql } from "drizzle-orm"

import { linkTermsToDocuments } from "~/admin/catalog.server"
import { plannedDraftName } from "~/admin/draft-name"
import { newShareToken } from "~/admin/drafts.server"
import { MEMO_ANCHOR } from "~/review/anchors"
import { isPortalIssuedId } from "~/admin/labels"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import type {
  Bilingual,
  DatasetContent,
  ListingProvider,
  ResearchContent,
  RichText,
  VersionContent,
} from "~/content/types"
import { closePools, getOwnerDb } from "~/db/client.server"
import {
  accessionDate,
  cauEntry,
  comment,
  dataset,
  draftDatasetEntry,
  humAccession,
  labelPin,
  research,
  researchDraft,
  researchVersion,
} from "~/db/schema"
import { renderMarkdown } from "~/public/markdown.server"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import {
  buildAccessionDates,
  buildCauRows,
  buildDatasetContent,
  buildResearchContent,
  ownLines,
  type ProseReader,
  type TextReader,
} from "./build"
import { ACCESS_CRITERIA_KEY, contentKeySeeds, TYPE_OF_DATA_KEY } from "./catalog"
import { applyCellEdits, type CellEdit } from "./cell-edits"
import { applyListingEdits, type ListingEdit } from "./listing-edits"
import { applyProviderSplits, type ProviderSplit } from "./providers"
import { applySearchableFixes, type SearchableFix } from "./searchable-fixes"
import { applyTypeOfDataFixes, type TypeOfDataFix } from "./type-of-data-fixes"
import { applyVocabularyFixes, readVocabularyPlan, type VocabularyFix } from "./vocabulary-plan"
import { VOCABULARY_FACETS } from "./facets"
import { cleanseCharacters, cleanseContent, cleanseMarkdown, noCounts, type CleansingCounts } from "./cleansing"
import { datasetIdentity, researchIdentity } from "./identity"
import { markNotApplicable } from "./not-applicable"
import {
  applyKeyFixes,
  CATALOG_MERGES,
  moveImputationLines,
  moveMisfiledJgaAccessions,
  RAW_KEY_CORRECTIONS,
  reshapeCatalog,
  type KeyFix,
  type PlannedKey,
} from "./catalog-plan"
import { loadCms, type CmsDump } from "./cms"
import { selectDrafts, withdrawnDrafts, type WithdrawnData } from "./drafts"
import {
  loadDump,
  selectPublishedDatasets,
  versionNumber,
  type Dump,
  type EsDataset,
  type PublishedDataset,
} from "./es"
import { handKey, jgadsByStudy, type HandSplits, type ReviewItem } from "./inversion"
import {
  identityOf,
  insertChunked,
  insertReturning,
  loadSiteContent,
  readByHand,
  seedCatalog,
} from "./load"
import { byHand, labelTranslations, type ReadByHand } from "./numbers"
import {
  applyKeyRules,
  dropDatasets,
  dropResearch,
  followedRules,
  mergeDumps,
  restoreDatasets,
  type RestoredDataset,
  splitArchiveAccessions,
  splitSharedExperiments,
  type KeyRule,
} from "./prepare"
import { lineDictionary, restoreLineBreaks, type LineDictionary } from "./line-breaks"
import { readRelinks, relink, type Relink } from "./links"
import { assignNhaIds, MISSPELT } from "./nha"
import { requestComments, settleRequests } from "./requests"
import { applySiteEdits, type SiteEdit } from "./site-edits"
import { alike, researchPages, withoutInlineBullets, type PageArticle, type Preferred, type ResearchPages, type Site } from "./research-pages"
import { assertEditsApplied, assertPublicationEditsApplied, editPublications, editText, type PublicationEdit, type TextEdit } from "./text-edits"
import { richTextFromPlain } from "./richtext"
import { normalizeForComparison, plainAsV1, recoverRichText, richTextFromCell, type RecoverContext } from "./richtext-html"
import { loadDatasetStudies, loadHumAccessions } from "./upstream"

const INPUT = join(import.meta.dirname, "input", "l12")
const OUT = join(INPUT, "out")

/** Research the snapshot holds that are not research: a test entry. */
const NOT_RESEARCH = ["hum9999"]

/** The prefix a dataset with no accession yet has in the input (`es-drafts/`). */
const UNISSUED = "placeholder:"

function readJson(...path: string[]): unknown {
  return JSON.parse(readFileSync(join(INPUT, ...path), "utf8"))
}

interface DraftManifest {
  /** ES draft versions a fresher conversion from the source replaces. */
  replaces: string[]
}

/**
 * The snapshot with what v1 never took in: the published research it missed,
 * the drafts its source held that it had not converted, or had converted
 * before they were written further, and the datasets it dropped from research
 * it did take in (`es-restored/`).
 */
function heldDump(): Dump {
  let held = mergeDumps(loadDump(join(INPUT, "es")), loadDump(join(INPUT, "es-extra")))

  if (existsSync(join(INPUT, "es-drafts", "manifest.json"))) {
    const drafts = loadDump(join(INPUT, "es-drafts"))
    const { replaces } = readJson("es-drafts", "manifest.json") as DraftManifest
    const replaced = new Set(replaces)
    const newResearch = new Map([...drafts.research].filter(([humId]) => !held.research.has(humId)))
    held = {
      research: new Map([...held.research, ...newResearch]),
      publishedVersions: held.publishedVersions,
      latestVersion: held.latestVersion,
      datasetsByKey: new Map([...held.datasetsByKey, ...drafts.datasetsByKey]),
      versions: [...held.versions.filter((v) => !replaced.has(v.humVersionId)), ...drafts.versions],
    }
  }

  if (existsSync(join(INPUT, "es-restored", "manifest.json"))) {
    const restored = readJson("es-restored", "dataset.json") as { hits: { hits: { _source: EsDataset }[] } }
    held = restoreDatasets(
      held,
      restored.hits.hits.map((hit) => hit._source),
      readJson("es-restored", "manifest.json") as RestoredDataset[],
    )
  }

  const listed = withWrittenListings(dropResearch(held, NOT_RESEARCH))
  return existsSync(join(INPUT, "hand", "listing-edits.json"))
    ? applyListingEdits(listed, readJson("hand", "listing-edits.json") as ListingEdit[])
    : listed
}

interface KeyMap {
  keys: { from: string, action: string, to?: string }[]
  order: { en: string, ja: string, position: number }[]
}

/**
 * The two keys the reviewed table left open. The institute that did the
 * genotyping joins the analysis methods, its one value reworded into a sentence
 * that states what the institute did (`hand/cell-edits.json`); a template
 * placeholder with no data is dropped.
 */
const SETTLED: Record<string, KeyRule> = {
  "遺伝子型決定機関": { action: "merge-into", to: "Analysis Methods" },
  "Transcriptome Shotgun Assembly ID": { action: "drop" },
}

/**
 * v1's label table names a few rows with an instruction instead of a key. The
 * converter that reads a draft straight from the source leaves the instruction
 * in place as the key, so it is applied here.
 */
const INSTRUCTIONS: Record<string, KeyRule> = {
  不要な項目のため削除する: { action: "drop" },
}

/**
 * The reviewed table of v1's raw keys, corrected where a second look found it
 * wrong, and the catalog's own merges on top; chains are followed to their end.
 */
function keyRules(map: KeyMap): Map<string, KeyRule> {
  const rules = new Map<string, KeyRule>(Object.entries(INSTRUCTIONS))
  for (const key of map.keys) {
    if (key.action === "merge-into" && key.to !== undefined) rules.set(key.from, { action: "merge-into", to: key.to })
    else if (key.action === "drop") rules.set(key.from, { action: "drop" })
    else if (key.action === "review") {
      const settled = SETTLED[key.from]
      if (settled === undefined) throw new Error(`key ${key.from} is left for review and has no decision`)
      rules.set(key.from, settled)
    }
  }
  for (const [from, rule] of [...RAW_KEY_CORRECTIONS, ...CATALOG_MERGES]) rules.set(from, rule)
  return followedRules(rules)
}

function correctKeys(docs: Iterable<EsDataset>, rules: ReadonlyMap<string, KeyRule>, fixes: readonly KeyFix[]): void {
  for (const doc of docs) {
    for (const experiment of doc.experiments ?? []) {
      applyKeyFixes(doc.humId, experiment, fixes)
      applyKeyRules(experiment, rules)
      splitArchiveAccessions(experiment)
      moveMisfiledJgaAccessions(experiment)
      moveImputationLines(experiment)
    }
  }
}

interface CatalogPlan {
  keys: PlannedKey[]
  /** Codes of keys nothing is stored under once the merges are made. */
  gone: string[]
}

/** Joomla article ids to the aliases the old portal addressed them by. */
function articleAliases(): Map<string, string> {
  const aliases = new Map<string, string>()
  const raw = readFileSync(join(INPUT, "joomla", "prod.ndjson"), "utf8")
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue
    const article = JSON.parse(line) as { id: number, alias: string }
    aliases.set(String(article.id), article.alias)
  }
  return aliases
}

/** The old portal's articles on one site, published and draft (`joomla/{prod,staging}.ndjson`). */
function oldArticles(site: "prod" | "staging"): PageArticle[] {
  const raw = readFileSync(join(INPUT, "joomla", `${site}.ndjson`), "utf8")
  return raw.split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line) as PageArticle)
}

interface Recovery {
  /**
   * The reader for one research's own prose, which builds a value from the
   * stretch of the research's page or release note page with the same words.
   */
  researchIn: (humId: string, preferred: Preferred) => ProseReader
  /** The reader for one research's listing summary, from the cell of the old listing with the same words. */
  listingIn: (humId: string, site: Site) => ProseReader
  /** One research's values held as a single line, written as the stretch of its page with the same words. */
  textIn: (humId: string, preferred: Preferred) => TextReader
  /**
   * The reader for one research's datasets, which builds a table value v1 kept
   * only as text from the cell of the research's page with the same words.
   */
  readIn: (humId: string, preferred: Preferred) => ProseReader
  /** The type of data of one research's datasets, from the data ID table of its page where one has the words. */
  typeOfDataIn: (humId: string, preferred: Preferred) => (text: string, lang: "ja" | "en") => RichText
  counts: Record<string, number>
  typeOfData: Record<"page" | "text", number>
  /** Single-line values written as their page wrote them. */
  textFromPages: () => number
  notes: string[]
  /** Values a page has the words of, left as v1 wrote them: v1's writing is not what it made of the page's. */
  kept: KeptValue[]
  /** Paragraphs read from v1's text cut where the articles' lines end (`line-breaks.ts`). */
  lineBreaksRestored: () => number
}

interface KeptValue {
  humId: string
  lang: "ja" | "en"
  read: "prose" | "listing" | "text"
  v1: string
  page: string
}

const richPlain = (rich: RichText) => rich.map((line) => line.map((span) => span.text).join("")).join("\n")

/**
 * The readers of the load. **A value built from its research's page or the
 * old listing has no line breaks put back from the articles**: it has the lines
 * the page showed, and cutting it where another page broke the same words
 * would show lines the page never had. A value read from v1's text or from the
 * HTML v1 kept, which has at times lost its paragraphs too, has them put back.
 *
 * **A value is written as the page wrote it only where v1's value is what v1
 * made of the page**: the same once v1's own folding (`normalizeForComparison`)
 * is applied to both, with the spaces between two letters kept (`alike`).
 * Prose, whose line breaks v1 dropped in one language and made spaces in the
 * other, may differ in any whitespace where no stretch keeps those spaces.
 * Matching on the words alone already keeps a value whose words were changed
 * in v1; this keeps one whose writing alone was, and lists it.
 *
 * A reader reads each value once, so a value `ownLines` and the build both
 * read is counted once.
 */
function recovery(ctx: RecoverContext, pages: ResearchPages, lines: LineDictionary): Recovery {
  const counts: Record<string, number> = {}
  const typeOfData = { page: 0, text: 0 }
  const notes: string[] = []
  const kept = new Map<string, KeptValue>()
  const keep = (one: KeptValue) => kept.set(JSON.stringify(one), one)
  let restored = 0
  let textFromPages = 0
  const cutFromArticles = (rich: RichText): RichText => {
    const cut = restoreLineBreaks(rich, lines)
    restored += cut.restored
    return cut.rich
  }
  const reader = (context: RecoverContext): ProseReader => {
    const read = { ja: new WeakMap<object, RichText>(), en: new WeakMap<object, RichText>() }
    return (value, lang) => {
      const held = value == null ? undefined : read[lang].get(value)
      if (held !== undefined) return held
      const recovered = recoverRichText({ text: value?.text ?? "", rawHtml: value?.rawHtml ?? null, lang }, context)
      counts[recovered.source] = (counts[recovered.source] ?? 0) + 1
      if (recovered.note !== undefined) notes.push(recovered.note)
      const rich = recovered.source === "page" ? recovered.value : cutFromArticles(recovered.value)
      if (value != null) read[lang].set(value, rich)
      return rich
    }
  }
  const cached = <T>(make: (key: string) => T) => {
    const made = new Map<string, T>()
    return (key: string): T => {
      const held = made.get(key)
      if (held !== undefined) return held
      const one = make(key)
      made.set(key, one)
      return one
    }
  }
  const readers = cached((key) => {
    const [humId = "", version = "", site = "prod"] = key.split("/")
    const preferred: Preferred = { version: version === "" ? null : Number(version), site: site as Site }
    return reader({ ...ctx, pageCell: (plain, lang) => pages.tableValue(humId, lang, plain, preferred) })
  })
  const researchReaders = cached((key) => {
    const [humId = "", version = "", site = "prod"] = key.split("/")
    const preferred: Preferred = { version: version === "" ? null : Number(version), site: site as Site }
    return reader({
      ...ctx,
      pagePassage: (plain, lang) => {
        let first: RichText | undefined
        let loose: RichText | undefined
        const listed = withoutInlineBullets(plain)
        for (const one of pages.passages(humId, lang, plain, preferred)) {
          first ??= one
          const folded = plainAsV1(one, lang)
          if (alike(folded, plain, "spaced") || alike(folded, listed, "spaced")) return one
          if (loose === undefined && (alike(folded, plain, "bare") || alike(folded, listed, "bare"))) loose = one
        }
        if (first !== undefined && loose === undefined) keep({ humId, lang, read: "prose", v1: plain, page: richPlain(first) })
        return loose ?? null
      },
    })
  })
  const listingReaders = cached((key) => {
    const [humId = "", site = "prod"] = key.split("/")
    return reader({
      ...ctx,
      pageCell: (plain, lang) => {
        const cell = pages.listingCell(humId, lang, plain, site as Site)
        if (cell === null) return null
        const shown = richTextFromCell(cell, ctx).value
        if (alike(plainAsV1(shown, lang), plain, "commas aside")) return cell
        keep({ humId, lang, read: "listing", v1: plain, page: richPlain(shown) })
        return null
      },
    })
  })
  const textIn = (humId: string, preferred: Preferred): TextReader => (value, lang) => {
    if (value.trim() === "") return value
    const wrote = normalizeForComparison(value, lang)
    let first: string | undefined
    for (const found of pages.passages(humId, lang, value, preferred)) {
      const line = found.map((spans) => spans.map((span) => span.text).join("")).join(" ")
      first ??= line
      if (!alike(normalizeForComparison(line, lang), wrote, "spaced")) continue
      if (line !== value) textFromPages += 1
      return line
    }
    if (first !== undefined) keep({ humId, lang, read: "text", v1: value, page: first })
    return value
  }
  const where = (humId: string, preferred: Preferred) => `${humId}/${preferred.version ?? ""}/${preferred.site}`
  const typeOfDataIn = (humId: string, preferred: Preferred) => (text: string, lang: "ja" | "en"): RichText => {
    const cell = text.trim() === "" ? null : pages.typeOfData(humId, lang, text, preferred)
    if (cell === null) {
      typeOfData.text += 1
      return cutFromArticles(richTextFromPlain(text))
    }
    typeOfData.page += 1
    const built = richTextFromCell(cell, ctx)
    if (built.note !== undefined) notes.push(built.note)
    return built.value
  }
  return {
    researchIn: (humId, preferred) => researchReaders(where(humId, preferred)),
    listingIn: (humId, site) => listingReaders(`${humId}/${site}`),
    textIn,
    readIn: (humId, preferred) => readers(where(humId, preferred)),
    typeOfDataIn,
    counts,
    typeOfData,
    textFromPages: () => textFromPages,
    notes,
    get kept() {
      return [...kept.values()]
    },
    lineBreaksRestored: () => restored,
  }
}

interface ListingCell {
  names: string[]
  tags: string[]
}

type ListingProviders = Record<string, { ja?: ListingCell, en?: ListingCell }>

/**
 * The provider column of the old listing for the research it named with a
 * programme: the name, then the programme in brackets. A programme only one
 * language named is spelled the same in both, so both have it.
 */
function listingProviders(cells: ListingProviders): Map<string, ListingProvider[]> {
  const out = new Map<string, ListingProvider[]>()
  for (const [humId, cell] of Object.entries(cells)) {
    const tags = cell.ja?.tags.length ? cell.ja.tags : (cell.en?.tags ?? [])
    const tagsEn = cell.en?.tags.length ? cell.en.tags : tags
    const names = cell.ja?.names ?? []
    const namesEn = cell.en?.names ?? []
    const count = Math.max(names.length, namesEn.length)
    const providers: ListingProvider[] = []
    for (let i = 0; i < count; i += 1) {
      const last = i === count - 1
      const ja = `${names[i] ?? ""}${last ? tags.map((t) => `（${t}）`).join("") : ""}`
      const en = `${namesEn[i] ?? ""}${last ? tagsEn.map((t) => ` (${t})`).join("") : ""}`
      providers.push({
        id: `listing-provider-${i + 1}`,
        name: { ja: { state: "value", value: ja }, en: { state: "value", value: en } },
      })
    }
    out.set(humId, providers)
  }
  return out
}

function withListing<T extends ResearchContent | Omit<ResearchContent, "datasetIds">>(
  content: T,
  providers: ListingProvider[] | undefined,
): T {
  if (providers === undefined) return content
  return { ...content, listingSummary: { ...content.listingSummary, dataProviders: providers } }
}

interface MinutesManifest {
  documents: { slug: string, locale: string, title: string, bodyFile: string, publishedAt: string }[]
}

interface RevisionManifest {
  target: { document: string, versionNumber: number, locale: string }
  bodyFile: string
  title: string
}

/** An HTML comment is text nobody sees, and v2's body refuses markup. */
function withoutComments(content: string | null): string | null {
  return content === null ? null : content.replace(/<!--[\s\S]*?-->\n?/g, "")
}

/**
 * The site content with what v1 left behind — the minutes of the old data
 * access committee, and the English side of one revision notice — and the
 * hand-written corrections to it (`site-edits.ts`).
 */
function siteContent(): CmsDump {
  const cms = loadCms(INPUT)
  const site = join(INPUT, "site")

  const minutes = readJson("site", "dac-minutes", "manifest.json") as MinutesManifest
  const added = minutes.documents.map((one) => ({
    slug: one.slug,
    versions: [{
      locale: one.locale,
      versionNumber: 1,
      status: "published",
      title: one.title,
      content: readFileSync(join(site, "dac-minutes", one.bodyFile), "utf8"),
      createdAt: one.publishedAt,
      publishedAt: one.publishedAt,
    }],
  }))

  const notice = readJson("site", "guideline-revision-2019-06", "manifest.json") as RevisionManifest
  const noticeBody = readFileSync(join(site, "guideline-revision-2019-06", notice.bodyFile), "utf8")
  const isTarget = (slug: string, version: { versionNumber: number, locale: string }) =>
    slug === notice.target.document
    && version.versionNumber === notice.target.versionNumber
    && version.locale === notice.target.locale
  const documents = cms.documents.map((doc) => {
    // The notice replaces every row v1 kept for that version and language — a
    // draft and a published one — with a single published row.
    const firstTarget = doc.versions.findIndex((version) => isTarget(doc.slug, version))
    const kept = doc.versions.filter((version, at) => !isTarget(doc.slug, version) || at === firstTarget)
    const versions = kept.map((version) => {
      const cleaned = { ...version, content: withoutComments(version.content) }
      if (!isTarget(doc.slug, version)) return cleaned
      const japanese = doc.versions.find((v) => v.versionNumber === notice.target.versionNumber
        && v.locale === "ja" && v.status === "published")
      return {
        ...cleaned,
        status: "published",
        title: notice.title,
        content: noticeBody,
        publishedAt: japanese?.publishedAt ?? cleaned.publishedAt,
      }
    })
    return { ...doc, versions }
  })

  const edited = { ...cms, documents: [...documents, ...added] }
  const edits = join(INPUT, "hand", "site-edits.json")
  return cleansedSite(existsSync(edits) ? applySiteEdits(edited, readJson("hand", "site-edits.json") as SiteEdit[]) : edited)
}

/**
 * A translation table keyed by the strings as the portal holds them, which is
 * after the character clean-ups (`cleanseCharacters`). The build reads a label
 * before those, so a key is looked up in its cleaned form.
 */
class CleanedKeys extends Map<string, Bilingual> {
  constructor(table: ReadonlyMap<string, Bilingual>) {
    super([...table].map(([key, pair]) => [cleanseCharacters(key, noCounts()), pair]))
  }

  override get(key: string): Bilingual | undefined {
    return super.get(cleanseCharacters(key, noCounts()))
  }

  override has(key: string): boolean {
    return super.has(cleanseCharacters(key, noCounts()))
  }
}

/** Counts of the clean-ups applied to the articles, news and alerts. */
const siteCleansing = noCounts()

/** The site's titles with the character clean-ups. The bodies are cleaned once they are markdown (`siteBody`). */
function cleansedSite(site: CmsDump): CmsDump {
  const plain = (text: string) => cleanseCharacters(text, siteCleansing)
  return {
    ...site,
    documents: site.documents.map((doc) => ({
      ...doc,
      versions: doc.versions.map((version) => ({ ...version, title: version.title === null ? null : plain(version.title) })),
    })),
    news: site.news.map((one) => ({ ...one, translations: one.translations.map((t) => ({ ...t, title: plain(t.title) })) })),
  }
}

/** A body of an article, a news item or an alert, cleaned rendering as it did (`cleanseMarkdown`). */
function siteBody(markdown: string): string {
  return cleanseMarkdown(markdown, (source) => renderMarkdown(source, "ja", { headingLinks: false }), siteCleansing)
}

interface HandDivision {
  block: string[]
  key: string
  lang: "ja" | "en"
  value: string
  perDataset: Record<string, string>
}

/**
 * The cells somebody divided where the rules could not, when they have been.
 * A division was written against the key the cell had in the dump; a key merged
 * without a heading keeps its text, so the division follows it to its new key.
 */
function handSplits(rules: ReadonlyMap<string, KeyRule>): HandSplits {
  const path = join(INPUT, "hand", "inversion.json")
  if (!existsSync(path)) return new Map()
  const divisions = JSON.parse(readFileSync(path, "utf8")) as HandDivision[]
  const keyOf = (key: string) => {
    const rule = rules.get(key)
    return rule?.action === "merge-into" && rule.labelled === undefined ? rule.to : key
  }
  return new Map(divisions.map((one) => [
    handKey(one.block, keyOf(one.key), one.lang, one.value),
    new Map(Object.entries(one.perDataset)),
  ]))
}

type Written = Record<"methods" | "targets" | "typeOfData", { ja: string, en: string }>

/**
 * The listing summary written by hand for research the old listing never
 * listed, and so v1 had none to convert. A summary the snapshot holds is
 * never replaced.
 */
function withWrittenListings(held: Dump): Dump {
  const path = join(INPUT, "hand", "listing-summaries.json")
  if (!existsSync(path)) return held
  const written = readJson("hand", "listing-summaries.json") as Record<string, Written>
  const research = new Map(held.research)
  for (const [humId, summary] of Object.entries(written)) {
    const one = research.get(humId)
    if (one === undefined) throw new Error(`a listing summary is written for ${humId}, which the snapshot does not hold`)
    if (one.summaryShort) throw new Error(`${humId} already has a listing summary`)
    const rich = (pair: { ja: string, en: string }) => ({ ja: { text: pair.ja, rawHtml: null }, en: { text: pair.en, rawHtml: null } })
    research.set(humId, {
      ...one,
      summaryShort: { methods: rich(summary.methods), targets: rich(summary.targets), typeOfData: rich(summary.typeOfData) },
    })
  }
  return { ...held, research }
}

/**
 * The files each dataset starts with selected, by the old name of the dataset:
 * what its page linked to and what is named after it, gathered once from the
 * old portal. The paths are the old server's, with the research's directory
 * first and sometimes deeper directories under it; the prefix is flat, so only
 * the file name is kept.
 */
function fileSeed(): Map<string, string[]> {
  const path = join(INPUT, "file-seed.json")
  if (!existsSync(path)) return new Map()
  const seed = readJson("file-seed.json") as Record<string, string[]>
  return new Map(Object.entries(seed).map(([label, paths]) => [
    label,
    [...new Set(paths.map((one) => one.split("/").at(-1) ?? one))],
  ]))
}

/** The hand-made table of dead links, when it has been made. */
function relinks(): Map<string, Relink> {
  const path = join(INPUT, "hand", "urls.tsv")
  return existsSync(path) ? readRelinks(readFileSync(path, "utf8")) : new Map<string, Relink>()
}

/** The version number a draft's version id names (`hum0290-v3`); its `version` may carry a suffix (`v3-joomla`). */
function draftNumber(humVersionId: string): number | null {
  const found = /-v(\d+)$/.exec(humVersionId)
  return found === null ? null : Number(found[1])
}

function copied(datasets: readonly PublishedDataset[]): PublishedDataset[] {
  return datasets.map((one) => ({ ...one, doc: structuredClone(one.doc) }))
}

async function load() {
  const loaded = heldDump()
  const keyMap = readJson("key-map.json") as KeyMap
  const fixes = existsSync(join(INPUT, "hand", "key-fixes.json")) ? readJson("hand", "key-fixes.json") as KeyFix[] : []
  const rules = keyRules(keyMap)
  if (existsSync(join(INPUT, "hand", "cell-edits.json"))) {
    applyCellEdits(loaded.datasetsByKey.values(), readJson("hand", "cell-edits.json") as CellEdit[])
  }
  if (existsSync(join(INPUT, "hand", "searchable-fixes.json"))) {
    applySearchableFixes(loaded.datasetsByKey.values(), readJson("hand", "searchable-fixes.json") as SearchableFix[])
  }
  if (existsSync(join(INPUT, "hand", "type-of-data.json"))) {
    applyTypeOfDataFixes(loaded.datasetsByKey.values(), readJson("hand", "type-of-data.json") as TypeOfDataFix[])
  }
  if (existsSync(join(INPUT, "hand", "data-providers.json"))) {
    const versions = new Set([...loaded.versions, ...loaded.publishedVersions, ...loaded.latestVersion.values()])
    applyProviderSplits(versions, readJson("hand", "data-providers.json") as ProviderSplit[])
  }
  correctKeys(loaded.datasetsByKey.values(), rules, fixes)
  // What the archive withdrew after publishing is kept in a draft of its own
  // and listed by no published version (`drafts.ts` の `withdrawnDrafts`).
  const withdrawn = existsSync(join(INPUT, "hand", "withdrawn.json")) ? readJson("hand", "withdrawn.json") as WithdrawnData[] : []
  const keptInDrafts = withdrawnDrafts(loaded, withdrawn)
  const held = dropDatasets(loaded, withdrawn.flatMap((one) => one.datasets))
  const catalogPlan = readJson("hand", "catalog.json") as CatalogPlan
  const ordered = keyMap.order
    .toSorted((a, b) => a.position - b.position)
    .map((one): [string, string] => [one.en, one.ja])

  const jgasToJgad = jgadsByStudy(loadDatasetStudies())
  const divided = handSplits(rules)
  const review: ReviewItem[] = []

  // Published: one description per dataset, the one the latest version pins.
  const selection = selectPublishedDatasets(held)
  const published = copied(selection.datasets)
  const byHum = new Map<string, PublishedDataset[]>()
  for (const one of published) byHum.set(one.humId, [...(byHum.get(one.humId) ?? []), one])
  for (const datasets of byHum.values()) {
    review.push(...splitSharedExperiments(datasets.map(({ label, doc }) => ({ label, doc })), jgasToJgad, divided).review)
  }

  // Drafts: each with its own copies of the datasets it lists.
  const selectedDrafts = selectDrafts(held.research, held.versions, held.datasetsByKey)
  const drafts = { ...selectedDrafts, drafts: [...selectedDrafts.drafts, ...keptInDrafts] }
  const draftDatasets = drafts.drafts.map((draft) => {
    const datasets = draft.datasets.map((one) => ({ label: one.label, doc: structuredClone(one.doc) }))
    review.push(...splitSharedExperiments(datasets, jgasToJgad, divided).review)
    return datasets
  })

  const articles = { prod: oldArticles("prod"), staging: oldArticles("staging") }
  const aliases: RecoverContext = { articleAliases: articleAliases() }
  const prose = recovery(
    aliases,
    researchPages([{ site: "prod", articles: articles.prod }, { site: "staging", articles: articles.staging }], aliases),
    lineDictionary([...articles.prod, ...articles.staging].map((article) => article.introtext)),
  )
  const listing = listingProviders((readJson("listing-providers.json") as ListingProviders))
  const cms = siteContent()
  const moved = relinks()
  const followed = new Set<string>()
  const vocabulary = readVocabularyPlan(join(INPUT, "hand", "vocabulary"))
  const fixesApplied = new Set<VocabularyFix>()
  let notApplicable = 0
  const cleansing = noCounts()
  const textEdits = existsSync(join(INPUT, "hand", "text-edits.json")) ? readJson("hand", "text-edits.json") as TextEdit[] : []
  const textEdited = new Set<TextEdit>()
  const publicationEdits = existsSync(join(INPUT, "hand", "publication-edits.json")) ? readJson("hand", "publication-edits.json") as PublicationEdit[] : []
  const publicationsEdited = new Set<PublicationEdit>()
  const linked = <T extends object>(content: T, where: { hum: string, dataset: boolean }): T => {
    const result = relink(content, moved)
    for (const url of result.used) followed.add(url)
    const marked = markNotApplicable(result.content)
    notApplicable += marked.marked
    const cleansed = cleanseContent(marked.content)
    for (const rule of Object.keys(cleansing) as (keyof CleansingCounts)[]) cleansing[rule] += cleansed.counts[rule]
    const edited = editText(cleansed.content, where, textEdits, textEdited)
    return where.dataset ? edited : editPublications(edited, where.hum, publicationEdits, publicationsEdited)
  }
  const db = getOwnerDb()

  const counts = await db.transaction(async (tx) => {
    await tx.execute(sql`
      TRUNCATE TABLE research, content_key, vocabulary_set, facet_category, cau_entry,
                     hum_accession, accession_date, upstream_refresh, document, news, alert CASCADE
    `)

    const { keyIdByCode, termIdBySetAndCode, termIdsOf, codeBySourceKey, knownCode } = await seedCatalog(
      tx,
      [...published.map((d) => d.doc), ...draftDatasets.flat().map((d) => d.doc)]
        .flatMap((doc) => doc.experiments ?? []),
      reshapeCatalog(contentKeySeeds(ordered), catalogPlan.keys, new Set(catalogPlan.gone)),
      vocabulary,
    )

    const humIds = [...held.research.keys()].sort()
    const researchIdByHum = await insertReturning(
      humIds,
      (hum) => hum,
      (chunk) => tx.insert(research).values(chunk.map((hum) => ({ id: researchIdentity(hum) }))).returning({ id: research.id }),
    )
    await insertChunked(humIds, (chunk) => tx.insert(labelPin).values(chunk.map((hum) => ({
      kind: "hum" as const,
      label: hum,
      researchId: identityOf(researchIdByHum, hum, "research"),
      isPrimary: true,
    }))))

    // Every dataset a published version or a draft lists, under the research
    // that lists it. A label two research claim is reported, not guessed at.
    const humOfLabel = new Map<string, string>()
    const claimedTwice: { label: string, humIds: string[] }[] = []
    const claim = (label: string, humId: string) => {
      const held = humOfLabel.get(label)
      if (held === undefined) humOfLabel.set(label, humId)
      else if (held !== humId) claimedTwice.push({ label, humIds: [held, humId] })
    }
    for (const one of published) claim(one.label, one.humId)
    drafts.drafts.forEach((draft, i) => {
      for (const one of draftDatasets[i] ?? []) claim(one.label, draft.version.humId)
    })
    const labels = [...humOfLabel.keys()].sort()
    const datasetIdByLabel = await insertReturning(
      labels,
      (label) => label,
      (chunk) => tx
        .insert(dataset)
        .values(chunk.map((label) => ({
          id: datasetIdentity(label),
          researchId: identityOf(researchIdByHum, humOfLabel.get(label) ?? "", "research"),
        })))
        .returning({ id: dataset.id }),
    )
    // A dataset whose accession has not been issued yet is made without a
    // label; the source wrote a placeholder there, renamed per research on input.
    const issued = labels.filter((label) => !label.startsWith(UNISSUED))
    // What v1 named after the research gets an NHA id as its primary label and
    // keeps the old name, and its known misspellings, as secondary ones.
    const firstPublished = new Map(selection.datasets.map((one) => [one.label, one.firstListedOn]))
    const nha = assignNhaIds(issued.filter((label) => isPortalIssuedId(label)).map((label) => ({
      label,
      humId: humOfLabel.get(label) ?? "",
      firstPublished: firstPublished.get(label) ?? null,
    })))
    const pins = issued.flatMap((label) => {
      const datasetId = identityOf(datasetIdByLabel, label, "dataset")
      const issuedId = nha.get(label)
      if (issuedId === undefined) return [{ label, datasetId, isPrimary: true }]
      return [{ label: issuedId, datasetId, isPrimary: true }, { label, datasetId, isPrimary: false }]
    })
    for (const [misspelt, meant] of Object.entries(MISSPELT)) {
      if (datasetIdByLabel.has(meant) && !datasetIdByLabel.has(misspelt)) {
        pins.push({ label: misspelt, datasetId: identityOf(datasetIdByLabel, meant, "dataset"), isPrimary: false })
      }
    }
    await insertChunked(pins, (chunk) => tx.insert(labelPin).values(chunk.map((pin) => ({ kind: "dataset" as const, ...pin }))))

    const unread: { dataset: string, sourceKey: string, line: string }[] = []
    // The shared readings, and the lines read for this load (`hand/read-by-hand.json`).
    const hand = byHand([
      ...readByHand(),
      ...(existsSync(join(INPUT, "hand", "read-by-hand.json")) ? readJson("hand", "read-by-hand.json") as ReadByHand[] : []),
    ])
    // What each number's label and note say in the other language (`numbers.ts` の `bilingualOf`).
    const numberLabels = existsSync(join(INPUT, "hand", "number-labels.json"))
      ? new CleanedKeys(labelTranslations(readJson("hand", "number-labels.json") as Record<string, Bilingual>))
      : new Map<string, Bilingual>()
    const datasetLabels = new Set(labels)
    const selected = fileSeed()
    // The key each vocabulary's values are under, for the fixes to find.
    const keyCodeOfSet = new Map(VOCABULARY_FACETS.map((facet) => [facet.setCode, facet.code]))
    const describe = (one: PublishedDataset, siblings: ReadonlySet<string>, preferred: Preferred): DatasetContent => {
      const fixed = applyVocabularyFixes(describeFromDump(one, siblings, preferred), vocabulary.fixes, {
        hum: one.humId,
        datasetId: one.label,
        keyIdOfSet: (setCode) => keyIdByCode.get(keyCodeOfSet.get(setCode) ?? setCode),
        termIdOf: (setCode, code) => termIdBySetAndCode.get(`${setCode}/${code}`),
      })
      for (const fix of fixed.applied) fixesApplied.add(fix)
      return { ...fixed.dataset, fileSelection: nha.has(one.label) ? selected.get(one.label) ?? [] : [] }
    }
    const describeFromDump = (one: PublishedDataset, siblings: ReadonlySet<string>, preferred: Preferred): DatasetContent => buildDatasetContent({
      dataset: one,
      keyIdByCode,
      codeBySourceKey,
      termIdBySetAndCode,
      termIdsOf,
      knownCode,
      accessCriteriaKeyCode: ACCESS_CRITERIA_KEY,
      typeOfDataKeyCode: TYPE_OF_DATA_KEY,
      datasetLabels,
      ownLines: siblings,
      unread,
      byHand: hand,
      labelTranslations: numberLabels,
      readProse: prose.readIn(one.humId, preferred),
      readTypeOfData: prose.typeOfDataIn(one.humId, preferred),
    })

    // A published dataset is described once, by the document the research's
    // latest version pins, so its page is the one v1 read it from.
    const publishedPreferred = (humId: string): Preferred => ({
      version: versionNumber(held.latestVersion.get(humId)?.version),
      site: "prod",
    })
    const publishedLines = ownLines(published, undefined, (one) => prose.readIn(one.humId, publishedPreferred(one.humId)))
    const descriptionOfDataset = new Map(published.map((one) => [
      identityOf(datasetIdByLabel, one.label, "dataset"),
      describe(one, publishedLines, publishedPreferred(one.humId)),
    ]))

    const versions = held.publishedVersions.filter((v) => researchIdByHum.has(v.humId))
    await insertChunked(
      versions.map((rv) => {
        if (!rv.versionReleaseDate) throw new Error(`${rv.humVersionId} has no release date`)
        const number = versionNumber(rv.version)
        if (number === null) throw new Error(`${rv.humVersionId} has no version number`)
        const isLatest = held.latestVersion.get(rv.humId) === rv
        const preferred: Preferred = { version: number, site: "prod" }
        const { datasetIds, ...body } = buildResearchContent({
          version: rv,
          listingSummary: isLatest ? held.research.get(rv.humId)?.summaryShort ?? null : null,
          datasetIdByLabel,
          humOfLabel,
          readProse: prose.researchIn(rv.humId, preferred),
          readListing: prose.listingIn(rv.humId, "prod"),
          readText: prose.textIn(rv.humId, preferred),
        }) satisfies ResearchContent
        return {
          researchId: identityOf(researchIdByHum, rv.humId, "research"),
          number,
          content: linked({
            ...withListing(body, isLatest ? listing.get(rv.humId) : undefined),
            datasets: datasetIds.flatMap((datasetId) => {
              const content = descriptionOfDataset.get(datasetId)
              return content === undefined ? [] : [{ datasetId, ...content }]
            }),
          } satisfies VersionContent, { hum: rv.humId, dataset: false }),
          releaseDate: rv.versionReleaseDate,
        }
      }),
      (chunk) => tx.insert(researchVersion).values(chunk),
    )

    // A draft describes the research as it is being written, so it has the
    // listing the research has now.
    let draftEntries = 0
    let questions = 0
    for (const [i, draft] of drafts.drafts.entries()) {
      const humId = draft.version.humId
      // A dataset another research holds stays with that research: the draft
      // loses it, and the report names it (`claimedTwice`).
      const datasets = (draftDatasets[i] ?? []).filter((one) => humOfLabel.get(one.label) === humId).map((one): PublishedDataset => ({
        label: one.label,
        humId,
        doc: one.doc,
        firstListedOn: null,
      }))
      // A draft was written on the other site, from its own page there.
      const preferred: Preferred = { version: draftNumber(draft.version.humVersionId), site: "staging" }
      const built = withListing(buildResearchContent({
        version: draft.version,
        listingSummary: held.research.get(humId)?.summaryShort ?? null,
        datasetIdByLabel,
        humOfLabel,
        readProse: prose.researchIn(humId, preferred),
        readListing: prose.listingIn(humId, "prod"),
        readText: prose.textIn(humId, preferred),
      }), listing.get(humId))
      const own = new Set(datasets.map((one) => identityOf(datasetIdByLabel, one.label, "dataset")))
      const asking = settleRequests(linked({ ...built, datasetIds: built.datasetIds.filter((id) => own.has(id)) }, { hum: humId, dataset: false }))
      const content = asking.content
      const [row] = await tx
        .insert(researchDraft)
        .values({
          researchId: identityOf(researchIdByHum, humId, "research"),
          name: draft.name ?? plannedDraftName(versionNumber(held.latestVersion.get(humId)?.version)),
          content,
          shareToken: newShareToken(),
        })
        .returning({ id: researchDraft.id })
      if (row === undefined) throw new Error(`the draft of ${humId} was not inserted`)

      // A draft's datasets were read from the draft's own page, on the site drafts were written on.
      const lines = ownLines(datasets, undefined, (one) => prose.readIn(one.humId, preferred))
      const said = [
        ...(draft.memo === undefined ? [] : [{ anchor: MEMO_ANCHOR, body: draft.memo }]),
        ...requestComments({ kind: "research" }, asking.asked),
      ]
      const entries = datasets.map((one) => {
        const datasetId = identityOf(datasetIdByLabel, one.label, "dataset")
        const described = settleRequests(linked(describe(one, lines, preferred), { hum: humId, dataset: true }))
        said.push(...requestComments({ kind: "dataset", datasetId }, described.asked))
        return { draftId: row.id, datasetId, content: described.content }
      })
      draftEntries += await insertChunked(entries, (chunk) => tx.insert(draftDatasetEntry).values(chunk))
      questions += await insertChunked(said, (chunk) => tx.insert(comment).values(chunk.map((one) => ({
        draftId: row.id,
        anchor: one.anchor,
        authorSub: BOOTSTRAP_ACTOR.sub,
        authorName: BOOTSTRAP_ACTOR.name,
        body: one.body,
      }))))
    }

    const cauRows = [...held.research.values()]
      .filter((r) => researchIdByHum.has(r.humId))
      .flatMap((r) => buildCauRows(r.humId, r.controlledAccessUser ?? []))
    await insertChunked(cauRows, (chunk) => tx.insert(cauEntry).values(chunk))

    const upstream = loadHumAccessions()
    await insertChunked(upstream, (chunk) => tx.insert(humAccession).values(chunk))

    const dates = buildAccessionDates(selection.datasets)
    await insertChunked(dates, (chunk) => tx.insert(accessionDate).values(chunk))

    // A fix that landed on no experiment was written against another input;
    // stopping inside the transaction leaves the previous load as it was.
    assertEditsApplied(textEdits, textEdited)
    assertPublicationEditsApplied(publicationEdits, publicationsEdited)
    const unlanded = vocabulary.fixes.filter((fix) => !fixesApplied.has(fix))
    if (unlanded.length > 0) {
      throw new Error(`vocabulary fixes that found nothing:\n${unlanded.map((fix) => `${fix.setCode} ${fix.hum} ${fix.datasetId} ${fix.header}`).join("\n")}`)
    }

    const site = await loadSiteContent(tx, cms, siteBody)
    // The articles each settled term links to, such as a data use policy's text.
    await linkTermsToDocuments(tx, [...vocabulary.terms].flatMap(([setCode, terms]) => terms.flatMap((term) =>
      term.document === null ? [] : [{ setCode, termCode: term.code, documentSlug: term.document }])))
    const search = await rebuildSearchDocs(tx)

    return {
      research: humIds.length,
      versions: versions.length,
      datasets: labels.length,
      nhaIds: nha.size,
      selectedFiles: [...nha.keys()].reduce((sum, label) => sum + (selected.get(label)?.length ?? 0), 0),
      drafts: drafts.drafts.length,
      draftEntries,
      questions,
      cau: cauRows.length,
      upstream: upstream.length,
      accessionDates: dates.length,
      ...site,
      search,
      unread,
      claimedTwice,
    }
  })

  const unfollowed = [...moved.keys()].filter((url) => !followed.has(url))
  return { counts, selection, drafts, review, prose, notApplicable, cleansing, relinked: { followed: followed.size, unfollowed } }
}

const { counts, selection, drafts, review, prose, notApplicable, cleansing, relinked } = await load()

mkdirSync(OUT, { recursive: true })
const written = (name: string, value: unknown) => {
  writeFileSync(join(OUT, name), `${JSON.stringify(value, null, 2)}\n`)
  return join(OUT, name)
}

console.log("research           ", counts.research)
console.log("published versions ", counts.versions)
console.log("datasets           ", counts.datasets, "of which", counts.nhaIds, "given NHA ids,", counts.selectedFiles, "files selected")
console.log("drafts             ", counts.drafts, "with", counts.draftEntries, "dataset entries")
console.log("questions asked    ", counts.questions, "comments")
console.log("controlled-access  ", counts.cau)
console.log("upstream accessions", counts.upstream)
console.log("accession dates    ", counts.accessionDates)
console.log("documents          ", counts.documents, "in", counts.series, "series")
console.log("news               ", counts.news)
console.log("alerts             ", counts.alerts)
console.log("search docs        ", counts.search)
console.log("prose read from    ", prose.counts)
console.log("unread number lines", counts.unread.length, written("unread-numbers.json", counts.unread))
console.log("cells to divide    ", review.length, written("inversion-review.json", review))
console.log("prose notes        ", prose.notes.length, written("prose-notes.json", prose.notes))
console.log("type of data from   ", prose.typeOfData)
console.log("line breaks from the articles", prose.lineBreaksRestored(), "paragraphs")
console.log("single lines as the pages wrote them", prose.textFromPages())
console.log("kept as v1 wrote them", prose.kept.length, written("pages-kept.json", prose.kept))
console.log("NA made not-applicable", notApplicable)
console.log("cleansed content   ", cleansing)
console.log("cleansed site      ", siteCleansing)
console.log("dead links followed", relinked.followed, "not found in content", relinked.unfollowed.length,
  written("relinks-not-found.json", relinked.unfollowed))
if (counts.claimedTwice.length > 0) console.log("claimed twice:", written("claimed-twice.json", counts.claimedTwice))
if (selection.missingDocuments.length > 0) console.log("pinned with no document:", selection.missingDocuments)
if (drafts.missingDocuments.length > 0) console.log("draft pins with no document:", drafts.missingDocuments)
if (existsSync(OUT)) console.log("reports in", OUT, readdirSync(OUT))

await closePools()
