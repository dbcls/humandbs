/**
 * Corrections to one research's content written by hand as exact
 * replacements, made on the content as it is stored, after the clean-ups: a
 * title whose lines the old listing broke for the width of its column, a
 * dash that reads wrongly once it is ASCII.
 *
 * An edit names the research, the part of its content (`title`, `grants`, …,
 * or `datasets` for what describes its datasets), optionally a language, and
 * the words, and replaces them in every version and draft of the research that
 * holds them. **An edit that finds nothing stops the load**, since the words
 * were copied from the loaded data.
 */

export interface TextEdit {
  hum: string
  /** A key of the research's content, or `datasets` for the datasets' descriptions. */
  field: string
  lang?: "ja" | "en"
  before: string
  after: string
}

const LANGUAGES = new Set(["ja", "en"])
/** Keys whose strings are matched elsewhere as written, as the clean-ups leave them. */
const IDENTIFIERS = new Set(["id", "keyId", "datasetId", "datasetIds", "termIds", "href", "url", "doi", "fileSelection"])

function replaced(node: unknown, edit: TextEdit, lang: string | undefined, made: () => void): unknown {
  if (typeof node === "string") {
    if ((edit.lang !== undefined && edit.lang !== lang) || !node.includes(edit.before)) return node
    made()
    return node.replaceAll(edit.before, edit.after)
  }
  if (Array.isArray(node)) return node.map((one) => replaced(one, edit, lang, made))
  if (typeof node !== "object" || node === null) return node
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [
    key,
    IDENTIFIERS.has(key) ? value : replaced(value, edit, LANGUAGES.has(key) ? key : lang, made),
  ]))
}

/**
 * The content of one research with its edits made, adding each edit that
 * found its words to `applied`. `dataset` is set for a dataset's own
 * description, which only `datasets` edits reach.
 */
export function editText<T extends object>(
  content: T,
  where: { hum: string, dataset: boolean },
  edits: readonly TextEdit[],
  applied: Set<TextEdit>,
): T {
  let out: Record<string, unknown> = content as Record<string, unknown>
  for (const edit of edits) {
    if (edit.hum !== where.hum) continue
    const made = () => applied.add(edit)
    if (where.dataset) {
      if (edit.field === "datasets") out = replaced(out, edit, undefined, made) as Record<string, unknown>
      continue
    }
    if (!(edit.field in out)) continue
    out = { ...out, [edit.field]: replaced(out[edit.field], edit, undefined, made) }
  }
  return out as T
}

/** Stops the load if an edit found its words nowhere. */
export function assertEditsApplied(edits: readonly TextEdit[], applied: ReadonlySet<TextEdit>): void {
  const unlanded = edits.filter((edit) => !applied.has(edit))
  if (unlanded.length > 0) {
    throw new Error(`text edits that found nothing:\n${unlanded.map((edit) => `${edit.hum} ${edit.field} ${edit.lang ?? ""} "${edit.before}"`).join("\n")}`)
  }
}
