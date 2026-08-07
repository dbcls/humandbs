/**
 * The fields a query may name, and what may be asked of each.
 *
 * A field is not a column of the content: it is a facet of the published set
 * that the search rows already carry. The list is deliberately short — the
 * facets the catalog defines join it once keys carry a type, and everything
 * else is reached through the full text.
 *
 * The target of a search — a research or a dataset — is **not** a field. The
 * address says which list is being read, so putting it in the query as well
 * would give one fact two places to disagree.
 */

export type FieldType = "identifier" | "text" | "date"

/** What a leaf asks of a field once its type and the shape of its value meet. */
export type Operator = "eq" | "contains" | "wildcard" | "between"

/**
 * The shapes a value comes in. A quoted value is not a kind of its own: quoting
 * is how a value with a space or a bracket in it is written down, and the index
 * matches the run of characters either way.
 */
export type ValueKind = "term" | "wildcard" | "date" | "range"

export const SEARCH_FIELDS = new Map<string, FieldType>([
  /** The primary label of the row itself: a hum label, or a dataset id. */
  ["id", "identifier"],
  /** The title of the research the row belongs to. */
  ["title", "text"],
  ["date_published", "date"],
  ["date_modified", "date"],
])

export function fieldType(name: string): FieldType | undefined {
  return SEARCH_FIELDS.get(name)
}

/**
 * The operator a field and a value shape imply, or null when the two do not go
 * together. Deriving it means a query never names an operator, which keeps the
 * written form close to what people already know from Lucene.
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
  }
}
