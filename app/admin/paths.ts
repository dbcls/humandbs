/**
 * Reading and writing one field of a form by the path the conflict diff names.
 *
 * The path vocabulary is one across the whole of editing: a field is its chain
 * of names, and **an element of an array is addressed by its identity rather
 * than by its position**, because reordering must not move what points at it.
 * The same spelling is what a comment anchors by.
 *
 * Two things carry an identity and they spell it differently — content elements
 * hold an `id`, a value slot holds the `keyId` of the catalog key it is under —
 * so the walk accepts either. Nothing else in a form is an array of identified
 * things, and a plain array of strings is a value rather than a place to
 * descend into.
 *
 * Walking the structure instead of naming every field is safe only because the
 * paths come from the diff beside it: the two share this vocabulary, and the
 * law that taking every reported path leaves nothing to report is what keeps
 * them honest.
 */

function identityOf(item: unknown): string | undefined {
  if (typeof item !== "object" || item === null) return undefined
  const record = item as { id?: unknown, keyId?: unknown }
  if (typeof record.id === "string") return record.id
  return typeof record.keyId === "string" ? record.keyId : undefined
}

function elementOf(items: readonly unknown[], identity: string): unknown {
  return items.find((item) => identityOf(item) === identity)
}

export interface Found {
  found: boolean
  value: unknown
}

export function readAt(target: unknown, keys: readonly string[]): Found {
  const [head, ...rest] = keys
  if (head === undefined) return { found: true, value: target }
  if (Array.isArray(target)) {
    const element = elementOf(target as unknown[], head)
    return element === undefined ? { found: false, value: undefined } : readAt(element, rest)
  }
  if (typeof target !== "object" || target === null) return { found: false, value: undefined }
  const record = target as Record<string, unknown>
  return head in record ? readAt(record[head], rest) : { found: false, value: undefined }
}

/**
 * A copy of `target` with the value at `keys` replaced. A path into an element
 * that is not there changes nothing — the element's absence is a difference in
 * the array itself, and taking the array's own path is what replaces it.
 */
export function writeAt(target: unknown, keys: readonly string[], value: unknown): unknown {
  const [head, ...rest] = keys
  if (head === undefined) return value
  if (Array.isArray(target)) {
    const items = target as unknown[]
    return items.map((item) => identityOf(item) === head ? writeAt(item, rest, value) : item)
  }
  const record = target as Record<string, unknown>
  return { ...record, [head]: writeAt(record[head], rest, value) }
}
