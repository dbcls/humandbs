/**
 * What a research's page and a dataset's page tell search engines and link
 * previews about themselves: a short description, the page's own address, and
 * a schema.org `Dataset` in JSON-LD.
 *
 * **Only what the page shows**, in the page's language. A value the page draws
 * as a question or as not applicable is left out rather than written as an
 * empty string, since a crawler reads an empty value as the value.
 */

import { formatSize } from "~/files/prefix"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { datasetFileListPath, datasetPath, filePath, href, researchPath, researchVersionPath } from "./urls"
import type { PageSeo } from "./seo"
import { fieldText, valuesText, type DatasetView, type FieldView, type ResearchView } from "./view.server"

/** A search result shows about this much, and a preview less. */
const DESCRIPTION_LENGTH = 200

/** The most a `Dataset`'s description is read to. */
const JSON_LD_DESCRIPTION_LENGTH = 5000

function cut(text: string, length: number): string {
  // By code point, so a character outside the basic plane is not cut in half.
  const chars = Array.from(text.replace(/\s+/g, " ").trim())
  return chars.length <= length ? chars.join("") : `${chars.slice(0, length - 1).join("")}…`
}

/**
 * The text a field shows, or undefined when it shows none. A field whose lines
 * are several values is given the separator to join them with.
 */
function shown(field: FieldView | null, separator?: string): string | undefined {
  if (field === null) return undefined
  const text = (separator === undefined ? fieldText(field) : valuesText(field, separator)).trim()
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

/** What a research's page shows first: its title, or the hum label where there is none. */
function researchName(view: ResearchView): string {
  return shown(view.title) ?? view.humLabel
}

/** The research's aims, or its name where the aims are not settled, cut to `length`. */
function researchDescription(view: ResearchView, length: number): string {
  return cut(shown(view.summary.aims) ?? researchName(view), length)
}

export function researchSeo(view: ResearchView, input: { origin: string, locale: Locale }): PageSeo & { jsonLd: Record<string, unknown> } {
  const { origin, locale } = input
  const url = `${origin}${href(locale, researchPath(view.humLabel))}`
  const name = researchName(view)

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
    description: researchDescription(view, DESCRIPTION_LENGTH),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Dataset",
      "@id": url,
      url,
      name,
      "description": researchDescription(view, JSON_LD_DESCRIPTION_LENGTH),
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

/**
 * A version's page has the research's description and link preview but no
 * JSON-LD: the research already has a `Dataset` at its own page, and giving
 * every version one as well would have a search engine read the same research
 * as several distinct datasets (the reason a version's page is left off the
 * sitemap).
 */
export function researchVersionSeo(view: ResearchView, input: { origin: string, locale: Locale }): PageSeo {
  const { origin, locale } = input
  return {
    url: `${origin}${href(locale, researchVersionPath(view.humLabel, view.versionNumber))}`,
    description: researchDescription(view, DESCRIPTION_LENGTH),
    jsonLd: null,
  }
}

export function datasetSeo(view: DatasetView, input: { origin: string, locale: Locale }): PageSeo & { jsonLd: Record<string, unknown> } {
  const { origin, locale } = input
  const words = messagesFor(locale).dataset
  const url = `${origin}${href(locale, datasetPath(view.label))}`
  const researchUrl = `${origin}${href(locale, researchPath(view.humLabel))}`
  // Several types are a line each on the page, and one phrase here.
  const typeOfData = shown(view.typeOfData, locale === "ja" ? "、" : ", ")
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

  const distribution = view.files.total === 0
    ? []
    : view.namedFiles === null
      ? [{ "@type": "DataDownload", "contentUrl": `${origin}${datasetFileListPath(view.label)}`, "encodingFormat": "text/plain" }]
      : view.namedFiles.map((file) => ({
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
