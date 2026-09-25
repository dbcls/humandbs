/**
 * The production migration: v1 production, frozen as a snapshot, into v2.
 *
 * Unlike the development load (`run.ts`) it has everything the snapshot
 * holds rather than only what is published — the drafts too, with the datasets
 * they list — and it corrects what v1 lost or merged on the way:
 *
 * - the line breaks and links v1's extracted text dropped are recovered from
 *   the HTML it was extracted from, where the two still agree (`richtext-html.ts`),
 *   and elsewhere from the old portal's articles, where a one-line value reports
 *   the same as a block the articles showed on several lines (`line-breaks.ts`);
 * - the research v1 never took in are added, and a test research is left out
 *   (`prepare.ts`);
 * - cells v1 read wrongly out of the articles are put right by hand
 *   (`cell-edits.ts`), and experiment keys are renamed, merged and dropped by a
 *   reviewed table and by the rebuilt catalog, which gives the order and the
 *   labels (`catalog-plan.ts`);
 * - a block that several datasets kept word for word is divided among them
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

import { newShareToken } from "~/admin/drafts.server"
import { isPortalIssuedId } from "~/admin/labels"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import type {
  DatasetContent,
  ListingProvider,
  ResearchContent,
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
import { rebuildSearchDocs } from "~/search/rebuild.server"

import {
  buildAccessionDates,
  buildCauRows,
  buildDatasetContent,
  buildResearchContent,
  ownLines,
  type ProseReader,
} from "./build"
import { ACCESS_CRITERIA_KEY, contentKeySeeds, TYPE_OF_DATA_KEY } from "./catalog"
import { applyCellEdits, type CellEdit } from "./cell-edits"
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
import { selectDrafts } from "./drafts"
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
import { byHand, type ReadByHand } from "./numbers"
import {
  applyKeyRules,
  dropResearch,
  followedRules,
  mergeDumps,
  splitArchiveAccessions,
  splitSharedExperiments,
  type KeyRule,
} from "./prepare"
import { lineDictionary, restoreLineBreaksIn, type LineDictionary } from "./line-breaks"
import { readRelinks, relink, type Relink } from "./links"
import { assignNhaIds, MISSPELT } from "./nha"
import { requestComments, settleRequests } from "./requests"
import { applySiteEdits, type SiteEdit } from "./site-edits"
import { recoverRichText, type RecoverContext } from "./richtext-html"
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
 * and the drafts its source held that it had not converted, or had converted
 * before they were written further.
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

  return withWrittenListings(dropResearch(held, NOT_RESEARCH))
}

interface KeyMap {
  keys: { from: string, action: string, to?: string }[]
  order: { en: string, ja: string, position: number }[]
}

/**
 * The two keys the reviewed table left open. The institute that did the
 * genotyping joins the analysis methods, its one value reworded into a sentence
 * that reports what the institute did (`hand/cell-edits.json`); a template
 * placeholder with no data is dropped.
 */
const SETTLED: Record<string, KeyRule> = {
  "遺伝子型決定機関": { action: "merge-into", to: "Analysis Methods" },
  "Transcriptome Shotgun Assembly ID": { action: "drop" },
}

/**
 * v1's label table names a few rows with an instruction instead of a key. The
 * converter that reads a draft straight from the source leaves the instruction
 * shown as the key, so it is done here.
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

/** The blocks the old portal's articles, published and draft, showed on several lines. */
function articleLines(): LineDictionary {
  const bodies: string[] = []
  for (const site of ["prod", "staging"]) {
    const raw = readFileSync(join(INPUT, "joomla", `${site}.ndjson`), "utf8")
    for (const line of raw.split("\n")) {
      if (line.trim() === "") continue
      bodies.push((JSON.parse(line) as { introtext: string }).introtext)
    }
  }
  return lineDictionary(bodies)
}

interface Recovery {
  read: ProseReader
  counts: Record<string, number>
  notes: string[]
}

function recovery(ctx: RecoverContext): Recovery {
  const counts: Record<string, number> = {}
  const notes: string[] = []
  const read: ProseReader = (value, lang) => {
    const recovered = recoverRichText({ text: value?.text ?? "", rawHtml: value?.rawHtml ?? null, lang }, ctx)
    counts[recovered.source] = (counts[recovered.source] ?? 0) + 1
    if (recovered.note !== undefined) notes.push(recovered.note)
    return recovered.value
  }
  return { read, counts, notes }
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
  return existsSync(edits) ? applySiteEdits(edited, readJson("hand", "site-edits.json") as SiteEdit[]) : edited
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
 * kept, and so v1 had none to convert. A summary the snapshot holds is
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

function copied(datasets: readonly PublishedDataset[]): PublishedDataset[] {
  return datasets.map((one) => ({ ...one, doc: structuredClone(one.doc) }))
}

async function load() {
  const held = heldDump()
  const keyMap = readJson("key-map.json") as KeyMap
  const fixes = existsSync(join(INPUT, "hand", "key-fixes.json")) ? readJson("hand", "key-fixes.json") as KeyFix[] : []
  const rules = keyRules(keyMap)
  if (existsSync(join(INPUT, "hand", "cell-edits.json"))) {
    applyCellEdits(held.datasetsByKey.values(), readJson("hand", "cell-edits.json") as CellEdit[])
  }
  correctKeys(held.datasetsByKey.values(), rules, fixes)
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
  const drafts = selectDrafts(held.research, held.versions, held.datasetsByKey)
  const draftDatasets = drafts.drafts.map((draft) => {
    const datasets = draft.datasets.map((one) => ({ label: one.label, doc: structuredClone(one.doc) }))
    review.push(...splitSharedExperiments(datasets, jgasToJgad, divided).review)
    return datasets
  })

  const prose = recovery({ articleAliases: articleAliases() })
  const listing = listingProviders((readJson("listing-providers.json") as ListingProviders))
  const cms = siteContent()
  const moved = relinks()
  const followed = new Set<string>()
  const lineBreaks = articleLines()
  let lineBreaksRestored = 0
  let notApplicable = 0
  const linked = <T>(content: T): T => {
    const cut = restoreLineBreaksIn(content, lineBreaks)
    lineBreaksRestored += cut.restored
    const result = relink(cut.content, moved)
    for (const url of result.used) followed.add(url)
    const marked = markNotApplicable(result.content)
    notApplicable += marked.marked
    return marked.content
  }
  const db = getOwnerDb()

  const counts = await db.transaction(async (tx) => {
    await tx.execute(sql`
      TRUNCATE TABLE research, content_key, vocabulary_set, facet_category, cau_entry,
                     hum_accession, accession_date, upstream_refresh, document, news, alert CASCADE
    `)

    const { keyIdByCode, termIdBySetAndCode, codeBySourceKey, knownCode } = await seedCatalog(
      tx,
      [...published.map((d) => d.doc), ...draftDatasets.flat().map((d) => d.doc)]
        .flatMap((doc) => doc.experiments ?? []),
      reshapeCatalog(contentKeySeeds(ordered), catalogPlan.keys, new Set(catalogPlan.gone)),
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
    const datasetLabels = new Set(labels)
    const selected = fileSeed()
    const describe = (one: PublishedDataset, siblings: ReadonlySet<string>): DatasetContent => ({
      ...describeFromDump(one, siblings),
      fileSelection: nha.has(one.label) ? selected.get(one.label) ?? [] : [],
    })
    const describeFromDump = (one: PublishedDataset, siblings: ReadonlySet<string>): DatasetContent => buildDatasetContent({
      dataset: one,
      keyIdByCode,
      codeBySourceKey,
      termIdBySetAndCode,
      knownCode,
      accessCriteriaKeyCode: ACCESS_CRITERIA_KEY,
      typeOfDataKeyCode: TYPE_OF_DATA_KEY,
      datasetLabels,
      ownLines: siblings,
      unread,
      byHand: hand,
      readProse: prose.read,
    })

    const publishedLines = ownLines(published, prose.read)
    const descriptionOfDataset = new Map(published.map((one) => [
      identityOf(datasetIdByLabel, one.label, "dataset"),
      describe(one, publishedLines),
    ]))

    const versions = held.publishedVersions.filter((v) => researchIdByHum.has(v.humId))
    await insertChunked(
      versions.map((rv) => {
        if (!rv.versionReleaseDate) throw new Error(`${rv.humVersionId} has no release date`)
        const number = versionNumber(rv.version)
        if (number === null) throw new Error(`${rv.humVersionId} has no version number`)
        const isLatest = held.latestVersion.get(rv.humId) === rv
        const { datasetIds, ...body } = buildResearchContent({
          version: rv,
          listingSummary: isLatest ? held.research.get(rv.humId)?.summaryShort ?? null : null,
          datasetIdByLabel,
          humOfLabel,
          readProse: prose.read,
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
          } satisfies VersionContent),
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
      const built = withListing(buildResearchContent({
        version: draft.version,
        listingSummary: held.research.get(humId)?.summaryShort ?? null,
        datasetIdByLabel,
        humOfLabel,
        readProse: prose.read,
      }), listing.get(humId))
      const own = new Set(datasets.map((one) => identityOf(datasetIdByLabel, one.label, "dataset")))
      const asking = settleRequests(linked({ ...built, datasetIds: built.datasetIds.filter((id) => own.has(id)) }))
      const content = asking.content
      const [row] = await tx
        .insert(researchDraft)
        .values({
          researchId: identityOf(researchIdByHum, humId, "research"),
          content,
          shareToken: newShareToken(),
        })
        .returning({ id: researchDraft.id })
      if (row === undefined) throw new Error(`the draft of ${humId} was not inserted`)

      const lines = ownLines(datasets, prose.read)
      const said = requestComments({ kind: "research" }, asking.asked)
      const entries = datasets.map((one) => {
        const datasetId = identityOf(datasetIdByLabel, one.label, "dataset")
        const described = settleRequests(linked(describe(one, lines)))
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

    const site = await loadSiteContent(tx, cms)
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
  return { counts, selection, drafts, review, prose, lineBreaksRestored, notApplicable, relinked: { followed: followed.size, unfollowed } }
}

const { counts, selection, drafts, review, prose, lineBreaksRestored, notApplicable, relinked } = await load()

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
console.log("line breaks from the articles", lineBreaksRestored, "paragraphs")
console.log("NA made not-applicable", notApplicable)
console.log("dead links followed", relinked.followed, "not found in content", relinked.unfollowed.length,
  written("relinks-not-found.json", relinked.unfollowed))
if (counts.claimedTwice.length > 0) console.log("claimed twice:", written("claimed-twice.json", counts.claimedTwice))
if (selection.missingDocuments.length > 0) console.log("pinned with no document:", selection.missingDocuments)
if (drafts.missingDocuments.length > 0) console.log("draft pins with no document:", drafts.missingDocuments)
if (existsSync(OUT)) console.log("reports in", OUT, readdirSync(OUT))

await closePools()
