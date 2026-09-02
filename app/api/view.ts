/**
 * Turning the public projection into the JSON the API answers with.
 *
 * This is the only place the answer takes its shape, and every endpoint goes
 * through it — a single research, a search hit and a line of the bulk stream are
 * the same object, so there is no second notion of "the summary" to drift from
 * the full thing. What the shape is, is `./schema.ts`.
 *
 * **The input is already the public projection** (`app/content/public.ts`), so
 * nothing here decides what may be shown. What is left is turning the content
 * types into something a stranger can read, and four rules do all of it.
 *
 * - **No value means no key; "not applicable" means `null`.** The projection has
 *   already emptied every unsettled slot, so an empty one and an unsettled one
 *   are the same thing by the time they arrive here and both disappear. What
 *   survives is the one state that carries information: the value does not
 *   exist, and somebody has said so
 * - **A list is always there, empty if need be**, so that a reader can take its
 *   length without asking whether the key exists. This is ddbj-search-api's
 *   convention and consumers of both should not have to remember which is which
 * - **Prose comes out as plain text** (docs/data-model.md の「値と文」). The tree
 *   is how the portal stores a sentence; putting it on the wire would tie the
 *   answer to that and make every change to a node a breaking one. Links inside
 *   prose lose their destination, which is why the references a machine needs —
 *   accessions, dataset ids, vocabulary, files — are typed slots instead
 * - **Nothing internal escapes.** No uuid, no array-element id, no vocabulary
 *   term id. A vocabulary value is its code and its labels, and the code is the
 *   same spelling an address uses, so a value found here can be searched for
 *
 * Values under catalog keys come out in the catalog's display order, the same
 * order the pages draw them in: the content holds no order worth honouring, and
 * a stable one lets two answers be compared.
 */

import type { CauUsage, StoredFile } from "~/content/public"
import { toPlainText } from "~/content/richtext"
import type {
  DatasetContent,
  LocalizedLinks,
  NumberValue,
  ResearchContent,
  Slot,
  TranslatedRichText,
  TranslatedText,
  ValueSlot,
} from "~/content/types"
import { datasetPath, filePath, researchVersionPath } from "~/public/urls"
import type { CatalogView } from "~/public/view.server"

import type {
  ApiDataset,
  ApiLink,
  ApiLinks,
  ApiNumber,
  ApiResearch,
  ApiTerm,
  ApiText,
  ApiValue,
} from "./schema"

export interface ApiContext {
  /** Every URL in an answer is absolute, and this is what it is absolute to. */
  origin: string
  catalog: CatalogView
}

/**
 * A single-language value. `undefined` means the key is left out entirely, which
 * is what both an empty value and an unsettled one come to.
 */
function held(slot: Slot<string>): string | null | undefined {
  if (slot.state === "not-applicable") return null
  if (slot.state === "unknown") return undefined
  return slot.value === "" ? undefined : slot.value
}

/** A pair with nothing in either language is left out rather than sent empty. */
function pair(ja: string | null | undefined, en: string | null | undefined): ApiText | undefined {
  if (ja === undefined && en === undefined) return undefined
  const text: ApiText = {}
  if (ja !== undefined) text.ja = ja
  if (en !== undefined) text.en = en
  return text
}

export function textOf(value: TranslatedText): ApiText | undefined {
  return pair(held(value.ja), held(value.en))
}

function richSide(slot: TranslatedRichText["ja"]): string | null | undefined {
  if (slot.state === "not-applicable") return null
  if (slot.state === "unknown") return undefined
  const plain = toPlainText(slot.value)
  return plain === "" ? undefined : plain
}

export function richOf(value: TranslatedRichText): ApiText | undefined {
  return pair(richSide(value.ja), richSide(value.en))
}

function linkSide(slot: LocalizedLinks["ja"]): ApiLink[] | null | undefined {
  if (slot.state === "not-applicable") return null
  if (slot.state === "unknown") return undefined
  const links = slot.value.map((link) => ({ url: link.url, text: link.text }))
  return links.length === 0 ? undefined : links
}

export function linksOf(value: LocalizedLinks): ApiLinks | undefined {
  const ja = linkSide(value.ja)
  const en = linkSide(value.en)
  if (ja === undefined && en === undefined) return undefined
  const links: ApiLinks = {}
  if (ja !== undefined) links.ja = ja
  if (en !== undefined) links.en = en
  return links
}

/**
 * A catalog label, and the label of a vocabulary value. Neither carries a state
 * — the catalog holds both languages — so an empty one is simply a language the
 * catalog has not been given.
 */
function labelOf(labels: { labelJa: string | null, labelEn: string }): ApiText {
  return plainPair(labels.labelJa ?? "", labels.labelEn)
}

function plainPair(ja: string, en: string): ApiText {
  const text: ApiText = {}
  if (ja !== "") text.ja = ja
  if (en !== "") text.en = en
  return text
}

function termsOf(slot: Slot<string[]>, catalog: CatalogView): ApiTerm[] | null | undefined {
  if (slot.state === "not-applicable") return null
  if (slot.state === "unknown") return undefined
  const terms = slot.value.flatMap((id) => {
    const term = catalog.termById.get(id)
    return term === undefined ? [] : [{ code: term.code, label: labelOf(term) }]
  })
  return terms.length === 0 ? undefined : terms
}

/**
 * **A list, because a key holds a list** (`app/content/types.ts`). What each
 * entry is about and what qualifies it travel with it: a client that only wants
 * the number can read `value`, and one that wants to say which number it was
 * has the label without parsing prose.
 */
function numberOf(slot: Slot<NumberValue[]>): ApiNumber[] | null | undefined {
  if (slot.state === "not-applicable") return null
  if (slot.state === "unknown") return undefined
  return slot.value.map((one) => ({
    value: one.value,
    unit: one.unit,
    ...(one.label === null ? {} : { label: one.label }),
    ...(one.note === null ? {} : { note: one.note }),
  }))
}

function valueOf(slot: ValueSlot, catalog: CatalogView): ApiValue | undefined {
  const key = catalog.keyById.get(slot.keyId)
  if (key === undefined) return undefined
  const head = { key: key.code, label: labelOf(key) }
  const value = slot.value

  switch (value.kind) {
    case "text": {
      const text = richOf(value.text)
      return text === undefined ? undefined : { ...head, type: "text", text }
    }
    case "single": {
      const one = held(value.value)
      return one === undefined ? undefined : { ...head, type: "single", value: one }
    }
    case "accession": {
      const one = held(value.value)
      return one === undefined ? undefined : { ...head, type: "accession", value: one }
    }
    case "vocabulary": {
      const terms = termsOf(value.termIds, catalog)
      return terms === undefined ? undefined : { ...head, type: "vocabulary", terms }
    }
    case "number": {
      const numbers = numberOf(value.values)
      return numbers === undefined ? undefined : { ...head, type: "number", numbers }
    }
  }
}

function valuesOf(slots: readonly ValueSlot[], catalog: CatalogView): ApiValue[] {
  const positionOf = (code: string): number => catalog.keyByCode.get(code)?.position ?? 0
  return slots
    .flatMap((slot) => {
      const value = valueOf(slot, catalog)
      return value === undefined ? [] : [value]
    })
    .sort((a, b) => positionOf(a.key) - positionOf(b.key))
}

export interface ResearchInput {
  humLabel: string
  versionNumber: number
  releaseDate: string
  /** Every published version, so that a reader can reach the rest of them. */
  versions: readonly { number: number, releaseDate: string }[]
  content: ResearchContent
  /** Only published datasets are in here, which is what makes a listing honest. */
  datasetLabelById: ReadonlyMap<string, string>
  cau: readonly CauUsage[]
  files: readonly StoredFile[]
}

export function apiResearch(input: ResearchInput, context: ApiContext): ApiResearch {
  const labelsOf = (ids: readonly string[]): string[] =>
    ids.flatMap((id) => {
      const label = input.datasetLabelById.get(id)
      return label === undefined ? [] : [label]
    })

  return {
    id: input.humLabel,
    version: input.versionNumber,
    url: `${context.origin}${researchVersionPath(input.humLabel, input.versionNumber)}`,
    datePublished: input.releaseDate,
    versions: [...input.versions]
      .sort((a, b) => a.number - b.number)
      .map((version) => ({ version: version.number, datePublished: version.releaseDate })),
    title: textOf(input.content.title),
    summary: {
      aims: richOf(input.content.summary.aims),
      methods: richOf(input.content.summary.methods),
      targets: richOf(input.content.summary.targets),
      url: linksOf(input.content.summary.url),
    },
    listingSummary: {
      methods: richOf(input.content.listingSummary.methods),
      targets: richOf(input.content.listingSummary.targets),
      typeOfData: richOf(input.content.listingSummary.typeOfData),
    },
    releaseNote: richOf(input.content.releaseNote),
    dataProviders: input.content.dataProviders.map((provider) => ({
      name: textOf(provider.name),
      organization: {
        name: textOf(provider.organization.name),
        address: textOf(provider.organization.address),
      },
      orcid: held(provider.orcid),
      email: held(provider.email),
    })),
    researchProjects: input.content.researchProjects.map((project) => ({
      name: textOf(project.name),
      url: linksOf(project.url),
    })),
    grants: input.content.grants.map((grant) => ({
      title: textOf(grant.title),
      agency: textOf(grant.agency.name),
      grantIds: [...grant.grantIds],
    })),
    relatedPublications: input.content.relatedPublications.map((publication) => ({
      title: held(publication.title),
      doi: held(publication.doi),
      datasets: labelsOf(publication.datasetIds),
    })),
    datasets: labelsOf(input.content.datasetIds),
    controlledAccessUsers: input.cau.map((usage) => ({
      // The cache of an upstream system holds two languages and no state, so an
      // empty side is a language upstream does not have.
      principalInvestigator: plainPair(usage.principalInvestigator.ja, usage.principalInvestigator.en),
      affiliation: plainPair(usage.affiliation.ja, usage.affiliation.en),
      country: usage.country,
      researchTitle: plainPair(usage.researchTitle.ja, usage.researchTitle.en),
      periodStart: usage.periodStart,
      periodEnd: usage.periodEnd,
      datasets: [...usage.datasetAccessions],
    })),
    files: input.files.map((file) => ({
      name: file.name,
      size: file.size,
      url: `${context.origin}${filePath(input.humLabel, file.name)}`,
    })),
  }
}

export interface DatasetInput {
  label: string
  humLabel: string
  datePublished: string | null
  dateModified: string | null
  content: DatasetContent
  files: readonly StoredFile[]
}

export function apiDataset(input: DatasetInput, context: ApiContext): ApiDataset {
  const sizeOf = new Map(input.files.map((file) => [file.name, file.size]))
  return {
    id: input.label,
    research: input.humLabel,
    url: `${context.origin}${datasetPath(input.label)}`,
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    values: valuesOf(input.content.values, context.catalog),
    experiments: input.content.experiments.map((experiment) => ({
      label: held(experiment.label),
      values: valuesOf(experiment.values, context.catalog),
    })),
    files: input.content.fileSelection.flatMap((name) => {
      const size = sizeOf.get(name)
      return size === undefined
        ? []
        : [{ name, size, url: `${context.origin}${filePath(input.humLabel, name)}` }]
    }),
  }
}
