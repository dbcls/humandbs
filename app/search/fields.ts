/**
 * The fields a query may name, and what may be asked of each.
 *
 * A field is not a column of the content: it is a facet of the published set
 * that the search rows already carry. Four of them are built in and belong to
 * the rows themselves; the rest come from the catalog, one per key typed as a
 * vocabulary or a number. **Typing a key is therefore what adds a field**, and
 * the allowlist has no second list of its own to fall out of step with.
 *
 * A facet is named by the key's code and its value by the term's code. Neither
 * the display label nor the identity would do: a label makes an address stop
 * working the moment somebody renames a term, which is precisely what renaming
 * is defined not to do, and an identity leaves the address unreadable. The cost
 * is that **a key may not take the name of a built-in field**.
 *
 * The target of a search — a research or a dataset — is **not** a field. The
 * address says which list is being read, so putting it in the query as well
 * would give one fact two places to disagree.
 */

export type FieldType = "identifier" | "text" | "date" | "term" | "number"

/** What a leaf asks of a field once its type and the shape of its value meet. */
export type Operator = "eq" | "contains" | "wildcard" | "between"

/**
 * The shapes a value comes in. A quoted value is not a kind of its own: quoting
 * is how a value with a space or a bracket in it is written down, and the index
 * matches the run of characters either way.
 */
export type ValueKind = "term" | "wildcard" | "date" | "range"

export const BUILT_IN_FIELDS = new Map<string, FieldType>([
  /** The primary label of the row itself: a hum label, or a dataset id. */
  ["id", "identifier"],
  /** The title of the research the row belongs to. */
  ["title", "text"],
  ["date_published", "date"],
  ["date_modified", "date"],
])

/**
 * The built-in fields the refinement panel gives a control of its own, in the
 * order it draws them.
 *
 * **The rest of the panel is made of catalog keys**, and the rule that a facet
 * is a key typed as a vocabulary or a number is what keeps the panel and the
 * query language from holding two lists that can disagree. These two are the
 * exception, and they are named rather than derived so that a third built-in
 * field does not join them by being added.
 *
 * A date is not a key and is not going to become one: it is a column of the
 * search row, written when the object was published rather than entered under a
 * key by a curator. But it is the first thing a reader narrows a listing by, so
 * the panel reaches past the catalog for exactly these two.
 */
export const DATE_FACETS = ["date_published", "date_modified"] as const

export type DateFacet = typeof DATE_FACETS[number]

export function isDateFacet(name: string): name is DateFacet {
  return (DATE_FACETS as readonly string[]).includes(name)
}

/** A catalog key a query may name, and what compiling one needs to know. */
export interface FacetField {
  /** `content_key.code`, which is how the field is spelled in a query. */
  code: string
  keyId: string
  /**
   * **A disease is a term field too**: it is counted by the vocabulary terms it
   * points at, and a query names it the same way. The kind is kept apart from
   * `vocabulary` because the panel draws the two differently
   * (`docs/public-pages.md` の「絞り込み」).
   */
  kind: "vocabulary" | "number" | "disease"
  /** The set a term value is resolved in. Null for a number. */
  setId: string | null
}

export interface QueryFields {
  typeOf: (name: string) => FieldType | undefined
  facet: (name: string) => FacetField | undefined
}

/** The built-in fields alone: what a query means before a catalog is read. */
export const BUILT_IN_ONLY: QueryFields = {
  typeOf: (name) => BUILT_IN_FIELDS.get(name),
  facet: () => undefined,
}

export function queryFields(facets: readonly FacetField[]): QueryFields {
  const byCode = new Map(facets.map((facet) => [facet.code, facet]))
  return {
    typeOf: (name) => {
      const built = BUILT_IN_FIELDS.get(name)
      if (built !== undefined) return built
      const facet = byCode.get(name)
      if (facet === undefined) return undefined
      return facet.kind === "number" ? "number" : "term"
    },
    facet: (name) => byCode.get(name),
  }
}

/**
 * The operator a field and a value shape imply, or null when the two do not go
 * together. Deriving it means a query never names an operator, which keeps the
 * written form close to what people already know from Lucene.
 *
 * A term takes neither a wildcard nor a range: its values are codes drawn from
 * a closed set, so there is nothing to walk towards and nothing between two of
 * them.
 */
export function operatorFor(type: FieldType, kind: ValueKind): Operator | null {
  switch (type) {
    case "identifier":
      if (kind === "term" || kind === "date") return "eq"
      return kind === "wildcard" ? "wildcard" : null
    case "text":
      if (kind === "term" || kind === "date") return "contains"
      return kind === "wildcard" ? "wildcard" : null
    case "date":
      if (kind === "date") return "eq"
      return kind === "range" ? "between" : null
    case "term":
      return kind === "term" || kind === "date" ? "eq" : null
    case "number":
      if (kind === "range") return "between"
      return kind === "term" ? "eq" : null
  }
}
