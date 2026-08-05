/**
 * Turning v1 documents into v2 content.
 *
 * Everything here is a pure function of the dump plus the identities already
 * inserted, so the same input produces byte-identical content on every run and
 * two runs can be diffed against each other.
 *
 * Three shape changes happen here and nowhere else:
 *
 * - **A slot is always present.** v1 dropped a key when it had no value, so a
 *   missing value arrives as an absent key. It becomes an empty value rather
 *   than `unknown`: `unknown` means "there is a value but it is not settled",
 *   and published v1 content has essentially none of those (2 leaves), so
 *   asserting it here would invent a state the data does not carry.
 * - **Fields v2 holds as one language become one.** Publication titles and
 *   experiment labels are single-valued in v2; the language that carries the
 *   value wins, and where both do they agree in 94% or more of the data.
 * - **References become identities.** A dataset is addressed by its uuid, not
 *   by the `JGAD…` string, which is a label that can be corrected.
 */

import type {
  DataProvider,
  DatasetContent,
  Experiment,
  Grant,
  Link,
  LocalizedLinks,
  RelatedPublication,
  ResearchContent,
  ResearchProject,
  Slot,
  TranslatedText,
  ValueSlot,
} from "~/content/types"

import { accessCriteriaTermCode } from "./catalog"
import type {
  EsBilingual,
  EsBilingualRich,
  EsControlledAccessUser,
  EsLink,
  EsResearchVersion,
  EsSummaryShort,
  PublishedDataset,
} from "./es"

function richText(value: EsBilingualRich | null | undefined): TranslatedText {
  return { ja: value?.ja?.text ?? "", en: value?.en?.text ?? "" }
}

function plainText(value: EsBilingual | null | undefined): TranslatedText {
  return { ja: value?.ja ?? "", en: value?.en ?? "" }
}

function held<T>(value: T): Slot<T> {
  return { state: "value", value }
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
): Slot<LocalizedLinks> {
  return held({ ja: linkList(ja, `${prefix}-ja`), en: linkList(en, `${prefix}-en`) })
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
  summaryShort: EsSummaryShort | null
  datasetIdByLabel: Map<string, string>
}

export function buildResearchContent(input: ResearchContentInput): ResearchContent {
  const { version: rv, summaryShort, datasetIdByLabel } = input

  const dataProviders: DataProvider[] = (rv.dataProvider ?? []).map((p, i) => ({
    id: `data-provider-${i + 1}`,
    name: held(richText(p.name)),
    organization: {
      name: held(richText(p.organization?.name)),
      address: held(richText(p.organization?.address)),
    },
    orcid: single(p.orcid),
    email: single(p.email),
  }))

  const researchProjects: ResearchProject[] = (rv.researchProject ?? []).map((p, i) => ({
    id: `research-project-${i + 1}`,
    name: held(richText(p.name)),
    url: localizedLinks([p.url?.ja], [p.url?.en], `research-project-${i + 1}-url`),
  }))

  const grants: Grant[] = (rv.grant ?? []).map((g, i) => ({
    id: `grant-${i + 1}`,
    title: held(plainText(g.title)),
    agency: { name: held(plainText(g.agency?.name)) },
    grantIds: g.id ?? [],
  }))

  const relatedPublications: RelatedPublication[] = (rv.relatedPublication ?? []).map((p, i) => ({
    id: `publication-${i + 1}`,
    title: single(p.title?.en, p.title?.ja),
    doi: single(p.doi),
    datasetIds: datasetIdentities(p.datasetIds ?? [], datasetIdByLabel),
  }))

  return {
    title: held(plainText(rv.title)),
    summary: {
      aims: held(richText(rv.summary?.aims)),
      methods: held(richText(rv.summary?.methods)),
      targets: held(richText(rv.summary?.targets)),
      url: localizedLinks(rv.summary?.url?.ja ?? [], rv.summary?.url?.en ?? [], "summary-url"),
    },
    summaryShort: {
      methods: held(richText(summaryShort?.methods)),
      targets: held(richText(summaryShort?.targets)),
      typeOfData: held(richText(summaryShort?.typeOfData)),
    },
    releaseNote: held(richText(rv.releaseNote)),
    dataProviders,
    researchProjects,
    grants,
    relatedPublications,
    datasetIds: datasetIdentities((rv.datasets ?? []).map((d) => d.datasetId), datasetIdByLabel),
  }
}

export interface DatasetContentInput {
  dataset: PublishedDataset
  /** `content_key.code` to the identity it was inserted under. */
  keyIdByCode: Map<string, string>
  /** The v1 key string of an experiment value to a `content_key.code`. */
  codeBySourceKey: Map<string, string>
  /** `vocabulary_term.code` to identity, for the access criteria. */
  termIdByCode: Map<string, string>
  accessCriteriaKeyCode: string
  typeOfDataKeyCode: string
}

/**
 * A dataset id that the portal issues itself rather than one from an external
 * archive. Only these carry a release date in content; the dates of external
 * accessions belong to the archive and are cached instead.
 */
export function isPortalIssuedId(label: string): boolean {
  return label.startsWith("hum")
}

export function buildDatasetContent(input: DatasetContentInput): DatasetContent {
  const { dataset, keyIdByCode, codeBySourceKey, termIdByCode } = input
  const doc = dataset.doc

  const values: ValueSlot[] = []

  const criteriaKeyId = keyIdByCode.get(input.accessCriteriaKeyCode)
  const termCode = doc.criteria ? accessCriteriaTermCode(doc.criteria) : null
  const termId = termCode ? termIdByCode.get(termCode) : undefined
  if (criteriaKeyId && termId) {
    values.push({
      keyId: criteriaKeyId,
      slot: held({ kind: "vocabulary", termIds: [termId] }),
    })
  }

  const typeOfDataKeyId = keyIdByCode.get(input.typeOfDataKeyCode)
  if (typeOfDataKeyId && (doc.typeOfData?.ja || doc.typeOfData?.en)) {
    values.push({
      keyId: typeOfDataKeyId,
      slot: held({ kind: "text", text: plainText(doc.typeOfData) }),
    })
  }

  const experiments: Experiment[] = (doc.experiments ?? []).map((e, i) => ({
    id: `experiment-${i + 1}`,
    label: single(e.header?.ja?.text, e.header?.en?.text),
    values: Object.entries(e.data ?? {}).flatMap(([sourceKey, value]) => {
      const code = codeBySourceKey.get(sourceKey)
      if (code === undefined) throw new Error(`no catalog key for ${JSON.stringify(sourceKey)}`)
      const keyId = keyIdByCode.get(code)
      if (keyId === undefined) throw new Error(`catalog key ${code} was not inserted`)
      const text = richText(value)
      if (!text.ja && !text.en) return []
      return [{ keyId, slot: held({ kind: "text" as const, text }) }]
    }),
  }))

  return {
    releaseDate: isPortalIssuedId(dataset.label) ? dataset.firstListedOn : null,
    fileSelection: [],
    values,
    experiments,
  }
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
