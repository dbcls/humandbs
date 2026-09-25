/**
 * The parts of a load that the development data and the production migration
 * share: the insert helpers, the catalog with its vocabularies, and the site
 * content. Each takes what differs between the two as an argument — the
 * experiments whose terms are minted, the order of the catalog, the CMS input —
 * so both loads write these tables the same way.
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import type { Executor } from "~/db/client.server"
import {
  alert,
  contentKey,
  document,
  documentContent,
  documentSeries,
  event,
  facetCategory,
  news,
  newsContent,
  vocabularySet,
  vocabularyTerm,
} from "~/db/schema"
import { icd10TermIds, importIcd10Terms } from "~/icd10/vocabulary.server"

import { buildAlerts, buildDocuments, buildNews, loadCms, type CmsDump, type SuppliedAlertText } from "./cms"
import {
  ACCESS_CRITERIA_SET,
  ACCESS_CRITERIA_TERMS,
  contentKeySeeds,
  FACET_CATEGORIES,
} from "./catalog"
import type { EsExperiment } from "./es"
import { collectTerms, DISEASE_SET, vocabularySetSeeds } from "./facets"
import { heldIcd10Entries } from "./icd10-input"
import type { ReadByHand } from "./numbers"

/**
 * The lines somebody read by hand, if any have been. **Optional on purpose** —
 * a fresh checkout has none, and the rules alone still load the data.
 */
export function readByHand(): ReadByHand[] {
  const path = join(import.meta.dirname, "input", "read-by-hand.json")
  if (!existsSync(path)) return []
  return JSON.parse(readFileSync(path, "utf8")) as ReadByHand[]
}

/**
 * The banner translations somebody wrote, for the announcements the old CMS
 * holds in one language. Optional the same way, and `buildAlerts` reports which
 * one is missing when a banner that is up has no entry here.
 */
export function suppliedAlertText(): SuppliedAlertText[] {
  const path = join(import.meta.dirname, "input", "alert-translations.json")
  if (!existsSync(path)) return []
  return JSON.parse(readFileSync(path, "utf8")) as SuppliedAlertText[]
}

export const CHUNK = 500

/** A lookup that can only miss if the insert it refers to did not happen. */
export function identityOf<Key>(identities: Map<Key, string>, key: Key, what: string): string {
  const id = identities.get(key)
  if (id === undefined) throw new Error(`${what} ${String(key)} has no identity`)
  return id
}

export async function insertReturning<Row, Key>(
  rows: Row[],
  keyOf: (row: Row, index: number) => Key,
  insert: (chunk: Row[]) => Promise<{ id: string }[]>,
): Promise<Map<Key, string>> {
  const identities = new Map<Key, string>()
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const returned = await insert(chunk)
    returned.forEach((row, j) => {
      const source = chunk[j]
      if (source === undefined) throw new Error("an insert returned more rows than it was given")
      identities.set(keyOf(source, i + j), row.id)
    })
  }
  return identities
}

export async function insertChunked<Row>(
  rows: Row[],
  insert: (chunk: Row[]) => Promise<unknown>,
): Promise<number> {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK))
  return rows.length
}

/**
 * The catalog, the vocabularies, and every term the dump turns out to use.
 *
 * The terms are minted from the data rather than declared, because what a
 * controlled set ought to hold is a decision and this load is not the place for
 * it. **The one exception is the disease vocabulary**, which is the ICD10
 * classification put in whole from the distributions on disk
 * (`~/icd10/vocabulary.server`); the dump's codes are looked up in it.
 */
export async function seedCatalog(
  tx: Executor,
  experiments: EsExperiment[],
  seeds: ReturnType<typeof contentKeySeeds> = contentKeySeeds(),
) {
  const categories = await insertReturning(
    FACET_CATEGORIES,
    (c) => c.code,
    (chunk) => tx.insert(facetCategory).values(chunk).returning({ id: facetCategory.id }),
  )

  const sets = [
    {
      code: ACCESS_CRITERIA_SET,
      labelJa: "アクセス制限",
      labelEn: "Access criteria",
      hierarchical: false,
    },
    ...vocabularySetSeeds(),
  ]
  const setIdByCode = await insertReturning(
    sets,
    (s) => s.code,
    (chunk) => tx
      .insert(vocabularySet)
      .values(chunk.map((s) => ({
        code: s.code,
        labelJa: s.labelJa,
        labelEn: s.labelEn,
        hierarchical: s.hierarchical,
      })))
      .returning({ id: vocabularySet.id }),
  )

  // The classification has to be on disk before this runs; the import script
  // leaves it there (`npm run icd10:import`). Nothing
  // is written yet, so stopping here leaves the previous data as it was.
  const classification = heldIcd10Entries()
  if (classification === null) {
    throw new Error("the ICD10 distributions are not under migration/input; run `npm run icd10:import` first")
  }
  await importIcd10Terms(tx, classification)
  const icd10Ids = await icd10TermIds(tx)
  const knownCode = (code: string) => icd10Ids.has(code)

  const terms = [
    ...ACCESS_CRITERIA_TERMS.map((t) => ({
      setCode: ACCESS_CRITERIA_SET,
      ...t,
      parentCode: null,
      maker: null,
    })),
    ...[...collectTerms(experiments)].flatMap(([setCode, held]) =>
      held.map((term) => ({ setCode, ...term }))),
  ]

  const termRow = (
    term: (typeof terms)[number],
    index: number,
    parentId: string | null,
  ) => ({
    setId: identityOf(setIdByCode, term.setCode, "vocabulary set"),
    code: term.code,
    labelJa: term.labelJa,
    labelEn: term.labelEn,
    maker: term.maker,
    position: index,
    parentId,
  })
  const termKey = (term: { setCode: string, code: string }) => `${term.setCode}/${term.code}`

  const rootIds = await insertReturning(
    terms.filter((term) => term.parentCode === null),
    termKey,
    (chunk) => tx
      .insert(vocabularyTerm)
      .values(chunk.map((term, i) => termRow(term, i, null)))
      .returning({ id: vocabularyTerm.id }),
  )
  const childIds = await insertReturning(
    terms.filter((term) => term.parentCode !== null),
    termKey,
    (chunk) => tx
      .insert(vocabularyTerm)
      .values(chunk.map((term, i) => termRow(
        term,
        i,
        rootIds.get(`${term.setCode}/${term.parentCode ?? ""}`) ?? null,
      )))
      .returning({ id: vocabularyTerm.id }),
  )
  const termIdBySetAndCode = new Map([
    ...rootIds,
    ...childIds,
    ...[...icd10Ids].map(([code, id]): [string, string] => [`${DISEASE_SET}/${code}`, id]),
  ])

  const { keys, codeBySourceKey } = seeds
  const keyIdByCode = await insertReturning(
    keys,
    (k) => k.code,
    (chunk) => tx
      .insert(contentKey)
      .values(chunk.map((k) => ({
        code: k.code,
        scope: k.scope,
        valueType: k.valueType,
        labelJa: k.labelJa,
        labelEn: k.labelEn,
        position: k.position,
        vocabularySetId: k.vocabularySetCode === null
          ? null
          : identityOf(setIdByCode, k.vocabularySetCode, "vocabulary set"),
        multiple: k.multiple,
        canonicalUnit: k.canonicalUnit,
        inputUnits: k.inputUnits,
        facetCategoryId: k.facetCategoryCode === null
          ? null
          : identityOf(categories, k.facetCategoryCode, "facet category"),
      })))
      .returning({ id: contentKey.id }),
  )

  return { keyIdByCode, termIdBySetAndCode, codeBySourceKey, knownCode }
}

/**
 * Site content. Each locale that was published gets its row — publication is
 * per locale here, so a Japanese-only document stays Japanese-only rather than
 * gaining an empty English side.
 *
 * The version-less slug of a guideline becomes a series row naming the newest
 * revision, and every revision keeps its own numbered address.
 */
export async function loadSiteContent(tx: Executor, cms: CmsDump = loadCms()) {
  const { documents, series } = buildDocuments(cms.documents)
  const idBySlug = await insertReturning(
    documents,
    (d) => d.slug,
    (chunk) => tx
      .insert(document)
      .values(chunk.map((d) => ({ slug: d.slug })))
      .returning({ id: document.id }),
  )

  await insertChunked(
    series.map((s) => ({
      slug: s.slug,
      currentId: identityOf(idBySlug, s.currentSlug, "document"),
    })),
    (chunk) => tx.insert(documentSeries).values(chunk),
  )

  await insertChunked(
    documents.flatMap((d) => d.contents.map((c) => ({
      documentId: identityOf(idBySlug, d.slug, "document"),
      locale: c.locale,
      content: c.content,
      published: true,
      publishedAt: c.publishedAt,
    }))),
    (chunk) => tx.insert(documentContent).values(chunk),
  )

  const items = buildNews(cms.news)
  const newsIds = await insertReturning(
    items,
    (_, index) => index,
    (chunk) => tx
      .insert(news)
      .values(chunk.map((item) => ({ publishedAt: item.publishedAt })))
      .returning({ id: news.id }),
  )

  await insertChunked(
    items.flatMap((item, index) => item.contents.map((c) => ({
      newsId: identityOf(newsIds, index, "news"),
      locale: c.locale,
      content: c.content,
      published: true,
    }))),
    (chunk) => tx.insert(newsContent).values(chunk),
  )

  const alerts = buildAlerts(cms.alerts, suppliedAlertText())
  const alertIds = await insertReturning(
    alerts,
    (_, index) => index,
    (chunk) => tx
      .insert(alert)
      .values(chunk.map((a) => ({ content: a.content, active: a.active })))
      .returning({ id: alert.id }),
  )

  // The editing screen reports since when an alert has been up by reading the
  // trail, so one that comes across standing is put up there as well — under
  // the reserved actor, at the instant the input holds for it.
  await insertChunked(
    alerts.flatMap((a, index) => a.shownAt === null
      ? []
      : [{
          occurredAt: a.shownAt,
          actorSub: BOOTSTRAP_ACTOR.sub,
          actorName: BOOTSTRAP_ACTOR.name,
          action: "publish-site-content" as const,
          subjectType: "alert" as const,
          subjectId: identityOf(alertIds, index, "alert"),
        }]),
    (chunk) => tx.insert(event).values(chunk),
  )

  return {
    documents: documents.length,
    series: series.length,
    news: items.length,
    alerts: alerts.length,
  }
}
