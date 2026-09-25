/**
 * Which fields two versions of a draft disagree about.
 *
 * The answer is a list of paths (`form.ts`), and the editor uses it twice: the
 * banner across the top of a rejected save names the fields somebody else
 * changed, and the indicator beside each of those fields is what offers to import
 * their value. Nothing is merged and nothing is reloaded — **what is in the
 * form stays in the form** until the author reports otherwise.
 *
 * How two values are told apart and how an array is compared are the same for a
 * research and for a dataset, so they are defined in `compare.ts`.
 */

import {
  diff,
  elements,
  sameStrings,
  sameText,
  sameTextPair,
  type Diff,
} from "./compare"
import type {
  DataProviderInput,
  DraftInput,
  GrantInput,
  LinkInput,
  ListingProviderInput,
  LinksInput,
  LinksPairInput,
  RelatedPublicationInput,
  ResearchProjectInput,
} from "./form"
import { readAt, writeAt } from "./paths"

function sameLink(a: LinkInput, b: LinkInput): boolean {
  return a.id === b.id && a.url === b.url && a.text === b.text
}

function sameLinks(a: LinksInput, b: LinksInput): boolean {
  if (a.state !== b.state) return false
  if (a.state !== "value") return true
  return a.links.length === b.links.length
    && a.links.every((link, at) => {
      const counterpart = b.links[at]
      return counterpart !== undefined && sameLink(link, counterpart)
    })
}

function sameLinksPair(a: LinksPairInput, b: LinksPairInput): boolean {
  return sameLinks(a.ja, b.ja) && sameLinks(a.en, b.en)
}

function byId(element: { id: string }): string {
  return element.id
}

function provider(into: Diff, a: DataProviderInput, b: DataProviderInput, at: string): void {
  into.when(sameTextPair(a.name, b.name), `${at}.name`)
  into.when(sameTextPair(a.organization.name, b.organization.name), `${at}.organization.name`)
}

function listingProvider(into: Diff, a: ListingProviderInput, b: ListingProviderInput, at: string): void {
  into.when(sameTextPair(a.name, b.name), `${at}.name`)
}

function project(into: Diff, a: ResearchProjectInput, b: ResearchProjectInput, at: string): void {
  into.when(sameTextPair(a.name, b.name), `${at}.name`)
  into.when(sameLinksPair(a.url, b.url), `${at}.url`)
}

function grant(into: Diff, a: GrantInput, b: GrantInput, at: string): void {
  into.when(sameTextPair(a.title, b.title), `${at}.title`)
  into.when(sameTextPair(a.agency.name, b.agency.name), `${at}.agency.name`)
  into.when(sameStrings(a.grantIds, b.grantIds), `${at}.grantIds`)
}

function publication(
  into: Diff,
  a: RelatedPublicationInput,
  b: RelatedPublicationInput,
  at: string,
): void {
  into.when(sameText(a.title, b.title), `${at}.title`)
  into.when(sameText(a.doi, b.doi), `${at}.doi`)
  // One place on the page: the column lists both the chosen and the typed.
  into.when(sameStrings(a.datasetIds, b.datasetIds) && sameStrings(a.externalIds, b.externalIds), `${at}.datasetIds`)
}

/**
 * The paths at which `base` and `other` say different things, in the order the
 * form shows them.
 */
export function diffDraftInput(base: DraftInput, other: DraftInput): string[] {
  const into = diff()
  const a = base.content
  const b = other.content

  // **In the order the editing form orders its fields**, so that every
  // screen listing the places that differ reads them as the form does.
  into.when(sameTextPair(a.title, b.title), "title")
  into.when(sameTextPair(a.releaseNote, b.releaseNote), "releaseNote")
  into.when(sameTextPair(a.summary.aims, b.summary.aims), "summary.aims")
  into.when(sameTextPair(a.summary.methods, b.summary.methods), "summary.methods")
  into.when(sameTextPair(a.summary.targets, b.summary.targets), "summary.targets")
  into.when(sameLinksPair(a.summary.url, b.summary.url), "summary.url")

  elements(into, "dataProviders", a.dataProviders, b.dataProviders, byId, provider)
  elements(into, "researchProjects", a.researchProjects, b.researchProjects, byId, project)
  elements(into, "grants", a.grants, b.grants, byId, grant)
  elements(into, "relatedPublications", a.relatedPublications, b.relatedPublications, byId, publication)

  into.when(sameTextPair(a.listingSummary.methods, b.listingSummary.methods), "listingSummary.methods")
  into.when(sameTextPair(a.listingSummary.targets, b.listingSummary.targets), "listingSummary.targets")
  into.when(
    sameTextPair(a.listingSummary.typeOfData, b.listingSummary.typeOfData),
    "listingSummary.typeOfData",
  )
  elements(
    into,
    "listingSummary.dataProviders",
    a.listingSummary.dataProviders,
    b.listingSummary.dataProviders,
    byId,
    listingProvider,
  )

  into.when(sameStrings(a.datasetIds, b.datasetIds), "datasetIds")
  return into.paths
}

/**
 * One field of `theirs` written over `mine`, addressed by the path the diff
 * reported. The memo sits beside the content rather than inside it, so it is
 * the one path that does not descend through `content`.
 */
export function importField(mine: DraftInput, theirs: DraftInput, path: string): DraftInput {
  const keys = path === "note" ? ["note"] : ["content", ...path.split(".")]
  const taken = readAt(theirs, keys)
  if (!taken.found) return mine
  const written = writeAt(mine, keys, taken.value) as DraftInput
  // **A publication's datasets are one place holding two lists** — the ones
  // chosen and the ones typed (`publication` above) — so importing the place
  // imports both.
  if (keys[1] !== "relatedPublications" || keys.at(-1) !== "datasetIds") return written
  const typed = [...keys.slice(0, -1), "externalIds"]
  const other = readAt(theirs, typed)
  return other.found ? writeAt(written, typed, other.value) as DraftInput : written
}
