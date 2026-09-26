/**
 * The cells of a research's tables that the article left empty, made
 * not-applicable.
 *
 * The articles wrote a dash in a cell that had nothing to say — a grant with
 * no title of its own, a paper with no DOI yet — and v1 read the dash as
 * nothing. What reaches v2 is an empty value, which is a cell nobody has
 * filled in yet, and the migrated data cannot tell the two apart. **A cell left empty in a row whose other cells were written
 * is one the row does not have**, so it is not-applicable; a row with nothing
 * written at all is not a row, and is left alone.
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

const NOT_APPLICABLE = { state: "not-applicable" } as const

const isEmpty = (slot: Slot<string> | Slot<Link[]>) =>
  slot.state === "value" && (typeof slot.value === "string" ? slot.value.trim() === "" : slot.value.length === 0)

const isWritten = (slot: Slot<string> | Slot<Link[]>) => slot.state !== "value" || !isEmpty(slot)

const isEmptyList = (slot: Slot<string[]>) => slot.state === "value" && slot.value.length === 0

const pairWritten = (pair: TranslatedText) => isWritten(pair.ja) || isWritten(pair.en)

interface HasTables {
  summary: { url: LocalizedLinks }
  grants: Grant[]
  relatedPublications: RelatedPublication[]
  researchProjects: ResearchProject[]
}

/** The content with its tables' empty cells settled, and how many were. */
export function settleEmptyCells<T extends HasTables>(content: T): { content: T, settled: number } {
  let settled = 0
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
    if (!pairWritten(one.title) && !pairWritten(one.agency.name) && isEmptyList(one.grantIds)) return one
    return {
      ...one,
      title: pair(one.title),
      agency: { ...one.agency, name: pair(one.agency.name) },
      grantIds: isEmptyList(one.grantIds) ? none() : one.grantIds,
    }
  }
  const publication = (one: RelatedPublication): RelatedPublication => {
    if (!isWritten(one.title)) return one
    const cites = !isEmptyList(one.datasetIds) || (one.externalIds ?? []).length > 0
    return {
      ...one,
      doi: isEmpty(one.doi) ? none() : one.doi,
      datasetIds: cites ? one.datasetIds : none(),
      externalIds: cites ? one.externalIds : [],
    }
  }
  const project = (one: ResearchProject): ResearchProject => {
    if (!pairWritten(one.name) && !isWritten(one.url.ja) && !isWritten(one.url.en)) return one
    return { ...one, name: pair(one.name), url: links(one.url) }
  }

  const out: T = {
    ...content,
    summary: { ...content.summary, url: links(content.summary.url) },
    grants: content.grants.map(grant),
    relatedPublications: content.relatedPublications.map(publication),
    researchProjects: content.researchProjects.map(project),
  }
  return { content: out, settled }
}
