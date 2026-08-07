/**
 * Which fields two versions of a draft disagree about.
 *
 * The answer is a list of paths (`form.ts`), and the editor uses it twice: the
 * band across the top of a rejected save names the fields somebody else
 * changed, and the mark beside each of those fields is what offers to take
 * their value. Nothing is merged and nothing is reloaded — **what is in the
 * form stays in the form** until the author says otherwise.
 *
 * The comparison is of the meaning, not of the JSON: a slot that says there is
 * no value carries whatever was half typed into it before, and two slots that
 * differ only in that leftover text say the same thing.
 *
 * Arrays are compared twice over. The array's own path stands for membership
 * and order, and each element that exists on both sides is compared field by
 * field under its identity. An element only one side has therefore shows up as
 * a change to the array rather than as a change to a field nobody can see.
 */

import type {
  DataProviderInput,
  DraftInput,
  GrantInput,
  LinkInput,
  LinksInput,
  LinksPairInput,
  RelatedPublicationInput,
  ResearchProjectInput,
  TextInput,
  TextPairInput,
} from "./form"

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, at) => value === b[at])
}

/** Leftover text is invisible while the state says there is no value. */
function sameText(a: TextInput, b: TextInput): boolean {
  if (a.state !== b.state) return false
  return a.state !== "value" || a.text === b.text
}

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

function sameTextPair(a: TextPairInput, b: TextPairInput): boolean {
  return sameText(a.ja, b.ja) && sameText(a.en, b.en)
}

function sameLinksPair(a: LinksPairInput, b: LinksPairInput): boolean {
  return sameLinks(a.ja, b.ja) && sameLinks(a.en, b.en)
}

interface Diff {
  paths: string[]
  when: (same: boolean, path: string) => void
}

function diff(): Diff {
  const paths: string[] = []
  return {
    paths,
    when(same, path) {
      if (!same) paths.push(path)
    },
  }
}

type Compare<T> = (into: Diff, a: T, b: T, at: string) => void

function elements<T extends { id: string }>(
  into: Diff,
  path: string,
  base: readonly T[],
  other: readonly T[],
  compare: Compare<T>,
): void {
  into.when(sameStrings(base.map((e) => e.id), other.map((e) => e.id)), path)
  const otherById = new Map(other.map((element) => [element.id, element]))
  for (const element of base) {
    const counterpart = otherById.get(element.id)
    if (counterpart !== undefined) compare(into, element, counterpart, `${path}.${element.id}`)
  }
}

function provider(into: Diff, a: DataProviderInput, b: DataProviderInput, at: string): void {
  into.when(sameTextPair(a.name, b.name), `${at}.name`)
  into.when(sameTextPair(a.organization.name, b.organization.name), `${at}.organization.name`)
  into.when(
    sameTextPair(a.organization.address, b.organization.address),
    `${at}.organization.address`,
  )
  into.when(sameText(a.orcid, b.orcid), `${at}.orcid`)
  into.when(sameText(a.email, b.email), `${at}.email`)
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
  into.when(sameStrings(a.datasetIds, b.datasetIds), `${at}.datasetIds`)
}

/**
 * The paths at which `base` and `other` say different things, in the order the
 * form shows them.
 */
export function diffDraftInput(base: DraftInput, other: DraftInput): string[] {
  const into = diff()
  const a = base.content
  const b = other.content

  into.when(base.note === other.note, "note")
  into.when(sameTextPair(a.title, b.title), "title")
  into.when(sameTextPair(a.summary.aims, b.summary.aims), "summary.aims")
  into.when(sameTextPair(a.summary.methods, b.summary.methods), "summary.methods")
  into.when(sameTextPair(a.summary.targets, b.summary.targets), "summary.targets")
  into.when(sameLinksPair(a.summary.url, b.summary.url), "summary.url")
  into.when(sameTextPair(a.summaryShort.methods, b.summaryShort.methods), "summaryShort.methods")
  into.when(sameTextPair(a.summaryShort.targets, b.summaryShort.targets), "summaryShort.targets")
  into.when(
    sameTextPair(a.summaryShort.typeOfData, b.summaryShort.typeOfData),
    "summaryShort.typeOfData",
  )
  into.when(sameTextPair(a.releaseNote, b.releaseNote), "releaseNote")

  elements(into, "dataProviders", a.dataProviders, b.dataProviders, provider)
  elements(into, "researchProjects", a.researchProjects, b.researchProjects, project)
  elements(into, "grants", a.grants, b.grants, grant)
  elements(into, "relatedPublications", a.relatedPublications, b.relatedPublications, publication)

  into.when(sameStrings(a.datasetIds, b.datasetIds), "datasetIds")
  return into.paths
}

/**
 * One field of `theirs` written over `mine`, addressed by the path the diff
 * reported. This walks the structure rather than naming every field, which is
 * safe precisely because the paths come from the diff above: the two share one
 * vocabulary, and the law that taking every reported path leaves nothing to
 * report is what holds them together.
 *
 * A path into an array element that only the other side has changes nothing —
 * the element's absence is a difference in the array itself, and taking that
 * path is what replaces it.
 */
export function takeField(mine: DraftInput, theirs: DraftInput, path: string): DraftInput {
  const keys = path === "note" ? ["note"] : ["content", ...path.split(".")]
  const taken = read(theirs, keys)
  if (!taken.found) return mine
  return write(mine, keys, taken.value) as DraftInput
}

function elementOf(items: readonly unknown[], id: string): unknown {
  return items.find((item) => (item as { id?: unknown }).id === id)
}

function read(target: unknown, keys: readonly string[]): { found: boolean, value: unknown } {
  const [head, ...rest] = keys
  if (head === undefined) return { found: true, value: target }
  if (Array.isArray(target)) {
    const element = elementOf(target, head)
    return element === undefined ? { found: false, value: undefined } : read(element, rest)
  }
  if (typeof target !== "object" || target === null) return { found: false, value: undefined }
  const record = target as Record<string, unknown>
  return head in record ? read(record[head], rest) : { found: false, value: undefined }
}

function write(target: unknown, keys: readonly string[], value: unknown): unknown {
  const [head, ...rest] = keys
  if (head === undefined) return value
  if (Array.isArray(target)) {
    const items = target as unknown[]
    return items.map((item) =>
      (item as { id?: unknown }).id === head ? write(item, rest, value) : item)
  }
  const record = target as Record<string, unknown>
  return { ...record, [head]: write(record[head], rest, value) }
}
