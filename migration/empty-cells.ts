/**
 * The cells of a research's tables that the article left empty, made
 * not-applicable.
 *
 * The articles wrote a dash in a cell that had nothing to say — a grant with
 * no title of its own, a paper with no DOI yet — and v1 read the dash as
 * nothing. What reaches v2 is an empty value, which is a cell nobody has
 * filled in yet, and the migrated data cannot tell the two apart. **A cell left empty in a row whose other cells were written
 * is one the row does not have**, so it is not-applicable.
 *
 * **A row with no value in any cell is not a row**, and is taken out: the
 * table is then empty, and the page shows that there is nothing to list. A cell
 * holding `NA` or only a curator's request (`ご教示ください`) is no value — a
 * draft's form listed one row of requests in every table.
 *
 * **A pair with one language written is untranslated, not empty**: the page
 * shows the other language in its place, and not-applicable would hide it. A
 * URL has no other language to show, so each language is settled on its own —
 * the research's own URLs included, which the articles wrote for few.
 *
 * A list of IDs (grant numbers, a paper's datasets) has one state for the
 * whole list, so an empty one in a written row is not-applicable as a whole.
 */

import type { Grant, Link, LocalizedLinks, RelatedPublication, ResearchProject, Slot, TranslatedText } from "~/content/types"

import { isRequest } from "./requests"

const NOT_APPLICABLE = { state: "not-applicable" } as const

const isEmpty = (slot: Slot<string> | Slot<Link[]>) =>
  slot.state === "value" && (typeof slot.value === "string" ? slot.value.trim() === "" : slot.value.length === 0)

const isEmptyList = (slot: Slot<string[]>) => slot.state === "value" && slot.value.length === 0

/** A slot holding words of the row's own, not a request for them. */
const holds = (slot: Slot<string> | Slot<Link[]>) =>
  slot.state === "value" && !isEmpty(slot) && (typeof slot.value !== "string" || !isRequest(slot.value))

const pairHolds = (pair: TranslatedText) => holds(pair.ja) || holds(pair.en)

const listHolds = (slot: Slot<string[]>) => slot.state === "value" && slot.value.some((one) => !isRequest(one))

const grantHolds = (one: Grant) => pairHolds(one.title) || pairHolds(one.agency.name) || listHolds(one.grantIds)

const publicationHolds = (one: RelatedPublication) =>
  holds(one.title) || holds(one.doi) || listHolds(one.datasetIds) || (one.externalIds ?? []).some((id) => !isRequest(id))

const projectHolds = (one: ResearchProject) => pairHolds(one.name) || holds(one.url.ja) || holds(one.url.en)

interface HasTables {
  summary: { url: LocalizedLinks }
  grants: Grant[]
  relatedPublications: RelatedPublication[]
  researchProjects: ResearchProject[]
}

/** The content with its tables' empty cells settled and rows with no value taken out, and how many of each. */
export function settleEmptyCells<T extends HasTables>(content: T): { content: T, settled: number, dropped: number } {
  let settled = 0
  let dropped = 0
  const rowsHolding = <R>(rows: R[], holding: (one: R) => boolean): R[] => {
    const kept = rows.filter(holding)
    dropped += rows.length - kept.length
    return kept
  }
  const none = () => {
    settled += 1
    return NOT_APPLICABLE
  }
  // Both languages empty: the pair the row does not have.
  const pair = (one: TranslatedText): TranslatedText =>
    isEmpty(one.ja) && isEmpty(one.en) ? { ja: none(), en: none() } : one
  const links = (one: LocalizedLinks): LocalizedLinks =>
    ({ ja: isEmpty(one.ja) ? none() : one.ja, en: isEmpty(one.en) ? none() : one.en })

  const grant = (one: Grant): Grant => {
    return {
      ...one,
      title: pair(one.title),
      agency: { ...one.agency, name: pair(one.agency.name) },
      grantIds: isEmptyList(one.grantIds) ? none() : one.grantIds,
    }
  }
  const publication = (one: RelatedPublication): RelatedPublication => {
    const cites = !isEmptyList(one.datasetIds) || (one.externalIds ?? []).length > 0
    return {
      ...one,
      doi: isEmpty(one.doi) ? none() : one.doi,
      datasetIds: cites ? one.datasetIds : none(),
      externalIds: cites ? one.externalIds : [],
    }
  }
  const project = (one: ResearchProject): ResearchProject => ({ ...one, name: pair(one.name), url: links(one.url) })

  const out: T = {
    ...content,
    summary: { ...content.summary, url: links(content.summary.url) },
    grants: rowsHolding(content.grants, grantHolds).map(grant),
    relatedPublications: rowsHolding(content.relatedPublications, publicationHolds).map(publication),
    researchProjects: rowsHolding(content.researchProjects, projectHolds).map(project),
  }
  return { content: out, settled, dropped }
}
