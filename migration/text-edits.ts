/**
 * Corrections to one research's content written by hand as exact
 * replacements, made on the content as it is stored, after the clean-ups: a
 * title whose lines the old listing broke for the width of its column, a
 * dash that reads wrongly once it is ASCII.
 *
 * An edit names the research, the part of its content (`title`, `grants`, …,
 * or `datasets` for what describes its datasets), optionally a language, and
 * the words, and replaces them in every version and draft of the research that
 * holds them. An entry of a list of strings that an edit leaves empty is
 * taken out of the list: a grant number that was a project's name. **An edit
 * that finds nothing stops the load**, since the words were copied from the
 * loaded data.
 *
 * A publication is corrected by its title (`PublicationEdit`): a DOI the old
 * pages left out is filled in, and a paper listed twice is listed once.
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
  if (Array.isArray(node)) {
    const out = node.map((one) => replaced(one, edit, lang, made))
    return out.filter((one, at) => !(one === "" && typeof node[at] === "string" && node[at] !== ""))
  }
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

/**
 * A correction to the publications of one research, found by the title as it
 * is stored. `doi` fills in the DOI and `retitle` writes the title anew;
 * `repeated` lists the paper once, keeping the first entry with the title,
 * with the datasets the later ones cite, and dropping the later ones.
 */
export interface PublicationEdit {
  hum: string
  title: string
  /** Only the entry with this DOI, where two entries have the title. */
  having?: string
  doi?: string
  retitle?: string
  repeated?: boolean
}

interface Publication {
  title: { state: string, value?: unknown }
  doi: { state: string, value?: unknown }
  datasetIds?: string[]
  externalIds?: string[]
}

const union = (a: string[] | undefined, b: string[] | undefined) => [...new Set([...(a ?? []), ...(b ?? [])])]

/** The publications of one research's content with its edits made, adding each edit that found its title to `applied`. */
export function editPublications<T extends object>(
  content: T,
  hum: string,
  edits: readonly PublicationEdit[],
  applied: Set<PublicationEdit>,
): T {
  const listed = (content as { relatedPublications?: Publication[] }).relatedPublications
  if (listed === undefined) return content
  let publications = listed
  for (const edit of edits) {
    if (edit.hum !== hum) continue
    const matching = (one: Publication) => one.title.value === edit.title && (edit.having === undefined || one.doi.value === edit.having)
    const found = publications.filter(matching)
    if (found.length === 0) continue
    applied.add(edit)
    const [kept] = found
    publications = publications.flatMap((one) => {
      if (!matching(one)) return [one]
      if (edit.repeated === true) {
        if (one !== kept) return []
        return [{
          ...one,
          datasetIds: found.reduce<string[]>((all, each) => union(all, each.datasetIds), []),
          externalIds: found.reduce<string[]>((all, each) => union(all, each.externalIds), []),
        }]
      }
      return [{
        ...one,
        ...(edit.doi === undefined ? {} : { doi: { state: "value", value: edit.doi } }),
        ...(edit.retitle === undefined ? {} : { title: { state: "value", value: edit.retitle } }),
      }]
    })
  }
  return publications === listed ? content : { ...content, relatedPublications: publications }
}

/** Stops the load if a publication edit found its title nowhere. */
export function assertPublicationEditsApplied(edits: readonly PublicationEdit[], applied: ReadonlySet<PublicationEdit>): void {
  const unlanded = edits.filter((edit) => !applied.has(edit))
  if (unlanded.length > 0) {
    throw new Error(`publication edits that found nothing:\n${unlanded.map((edit) => `${edit.hum} "${edit.title}"`).join("\n")}`)
  }
}
