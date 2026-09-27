/**
 * What a research's page and a dataset's page tell search engines and link
 * previews about themselves: a short description, the page's own address, and
 * a schema.org `Dataset` in JSON-LD.
 *
 * **Only what the page shows**, in the page's language. A value the page draws
 * as a question or as not applicable is left out rather than written as an
 * empty string, since a crawler reads an empty value as the value.
 */

import type { MetaDescriptor } from "react-router"

import { formatSize } from "~/files/prefix"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { datasetFileListPath, datasetPath, filePath, href, researchPath } from "./urls"
import { fieldText, type DatasetView, type FieldView, type ResearchView } from "./view.server"

export interface PageSeo {
  /** The page's own address, in its language. */
  url: string
  /** A sentence or two, for a search result and a link preview. */
  description: string
  jsonLd: Record<string, unknown>
}

/** A search result shows about this much, and a preview less. */
const DESCRIPTION_LENGTH = 200

/** The most a `Dataset`'s description is read to. */
const JSON_LD_DESCRIPTION_LENGTH = 5000

/** Past this many files a dataset names its list of addresses instead of each file. */
const FILES_LISTED = 100

function cut(text: string, length: number): string {
  // By code point, so a character outside the basic plane is not cut in half.
  const chars = Array.from(text.replace(/\s+/g, " ").trim())
  return chars.length <= length ? chars.join("") : `${chars.slice(0, length - 1).join("")}…`
}

/** The text a field shows, or undefined when it shows none. */
function shown(field: FieldView | null): string | undefined {
  if (field === null) return undefined
  const text = fieldText(field).trim()
  return text === "" ? undefined : text
}

function present<T>(values: readonly (T | undefined)[]): T[] {
  return values.filter((value) => value !== undefined)
}

function catalog(origin: string, locale: Locale): Record<string, unknown> {
  return { "@type": "DataCatalog", "name": messagesFor(locale).siteName, "url": `${origin}${href(locale, "/")}` }
}

/** A DOI as an address, which is how a citation is followed; any other text as written. */
function citationOf(doi: string): string {
  return /^10\.\d+\//.test(doi) ? `https://doi.org/${doi}` : doi
}

export function researchSeo(view: ResearchView, input: { origin: string, locale: Locale }): PageSeo {
  const { origin, locale } = input
  const url = `${origin}${href(locale, researchPath(view.humLabel))}`
  const name = shown(view.title) ?? view.humLabel
  const aims = shown(view.summary.aims)

  const creator = view.dataProviders.flatMap((provider) => {
    const person = shown(provider.principalInvestigator)
    const organization = shown(provider.organization)
    if (person !== undefined) {
      return [{
        "@type": "Person",
        "name": person,
        ...organization === undefined ? {} : { affiliation: { "@type": "Organization", "name": organization } },
      }]
    }
    return organization === undefined ? [] : [{ "@type": "Organization", "name": organization }]
  })
  const funders = [...new Set(present(view.grants.map((grant) => shown(grant.agency))))]
  const citations = present(view.relatedPublications.map((publication) => {
    const doi = shown(publication.doi)
    return doi === undefined ? shown(publication.title) : citationOf(doi)
  }))

  return {
    url,
    description: cut(aims ?? name, DESCRIPTION_LENGTH),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Dataset",
      "@id": url,
      url,
      name,
      "description": cut(aims ?? name, JSON_LD_DESCRIPTION_LENGTH),
      "identifier": view.humLabel,
      "inLanguage": locale,
      "version": String(view.versionNumber),
      "datePublished": view.releaseDate,
      ...creator.length === 0 ? {} : { creator },
      ...funders.length === 0 ? {} : { funder: funders.map((one) => ({ "@type": "Organization", "name": one })) },
      ...citations.length === 0 ? {} : { citation: citations },
      ...view.datasets.length === 0
        ? {}
        : {
            hasPart: view.datasets.map((row) => {
              const address = `${origin}${href(locale, datasetPath(row.label))}`
              return { "@type": "Dataset", "@id": address, "url": address, "identifier": row.label, "name": row.label }
            }),
          },
      "includedInDataCatalog": catalog(origin, locale),
    },
  }
}

export function datasetSeo(view: DatasetView, input: { origin: string, locale: Locale }): PageSeo {
  const { origin, locale } = input
  const words = messagesFor(locale).dataset
  const url = `${origin}${href(locale, datasetPath(view.label))}`
  const researchUrl = `${origin}${href(locale, researchPath(view.humLabel))}`
  const typeOfData = shown(view.typeOfData)
  const methods = [...new Set(present(view.experiments.map((experiment) => shown(experiment.label))))]
  const access = view.accessType?.label

  // The same three the page puts first, after which dataset of which research it is.
  const stop = locale === "ja" ? "。" : ". "
  const description = [
    `${view.label} (${words.research} ${view.humLabel})`,
    ...typeOfData === undefined ? [] : [`${words.typeOfData}: ${typeOfData}`],
    ...methods.length === 0 ? [] : [`${words.experiments}: ${methods.join(", ")}`],
    ...access === undefined ? [] : [`${words.accessType}: ${access}`],
  ].join(stop) + stop.trim()

  const distribution = view.files.length === 0
    ? []
    : view.files.length > FILES_LISTED
      ? [{ "@type": "DataDownload", "contentUrl": `${origin}${datasetFileListPath(view.label)}`, "encodingFormat": "text/plain" }]
      : view.files.map((file) => ({
          "@type": "DataDownload",
          "name": file.name,
          "contentUrl": `${origin}${filePath(view.humLabel, file.name)}`,
          "contentSize": formatSize(file.size),
        }))

  return {
    url,
    description: cut(description, DESCRIPTION_LENGTH),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Dataset",
      "@id": url,
      url,
      "name": typeOfData === undefined ? view.label : `${view.label}: ${typeOfData}`,
      "description": cut(description, JSON_LD_DESCRIPTION_LENGTH),
      "identifier": [view.label, ...view.secondaryLabels],
      "inLanguage": locale,
      "isPartOf": { "@type": "Dataset", "@id": researchUrl, "url": researchUrl, "identifier": view.humLabel },
      ...view.datePublished === null ? {} : { datePublished: view.datePublished },
      ...view.dateModified === null ? {} : { dateModified: view.dateModified },
      ...access === undefined ? {} : { conditionsOfAccess: access },
      ...methods.length === 0 ? {} : { measurementTechnique: methods },
      ...view.dataVolume === null ? {} : { contentSize: formatSize(view.dataVolume) },
      ...view.fileFormats.length === 0 ? {} : { encodingFormat: view.fileFormats },
      ...distribution.length === 0 ? {} : { distribution },
      "includedInDataCatalog": catalog(origin, locale),
    },
  }
}

/** The page's title, description, preview and JSON-LD, as a route's `meta` returns them. */
export function seoMeta(seo: PageSeo, title: string, locale: Locale): MetaDescriptor[] {
  return [
    { title },
    { name: "description", content: seo.description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: messagesFor(locale).siteName },
    { property: "og:title", content: title },
    { property: "og:description", content: seo.description },
    { property: "og:url", content: seo.url },
    { property: "og:locale", content: locale === "ja" ? "ja_JP" : "en_US" },
    { "script:ld+json": seo.jsonLd },
  ]
}
