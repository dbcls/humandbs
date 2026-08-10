/**
 * The correspondence between hum labels and JGA accessions, as DDBJ Search
 * already spells it.
 *
 * This is the one thing the portal supplies rather than publishes: DDBJ Search
 * draws a link to humandbs on its JGA study and dataset pages, and today that
 * link comes from a nightly TSV a cron builds beside the application system and
 * copies to another host. The endpoint replaces those three steps.
 *
 * **The shape is ddbj-search-api's DBLinks API**, down to the field names. The
 * consumer already has the `Xref` type, already knows `humandbs` as an accession
 * type, and already builds `https://humandbs.dbcls.jp/{humId}` from it — nothing
 * is gained by inventing a second vocabulary for the same edges.
 *
 * **Only researches the portal has published appear.** An edge to an
 * unpublished hum would be a link that answers 404, and it would also give away
 * that the label exists at all — which is exactly what answering 404 for
 * "unpublished" and "no such label" alike is there to prevent
 * (docs/public-pages.md).
 *
 * **Nothing found is 200 with an empty list.** An accession nobody has heard of
 * and an accession whose research is not published therefore answer the same,
 * which is what keeps the second one from being detectable.
 */

/** Where an entry of another archive is read. DDBJ Search's own entry address. */
const SEARCH_ENTRY_BASE = "https://ddbj.nig.ac.jp/search/entry"

export const ACCESSION_TYPES = ["humandbs", "jga-dataset", "jga-study"] as const

export type AccessionType = typeof ACCESSION_TYPES[number]

/** The two kinds the upstream cache holds, as accession types. */
export type JgaType = Extract<AccessionType, "jga-dataset" | "jga-study">

export function isAccessionType(value: string): value is AccessionType {
  return (ACCESSION_TYPES as readonly string[]).includes(value)
}

export interface Xref {
  identifier: string
  type: AccessionType
  url: string
}

export interface DbLinks {
  identifier: string
  type: AccessionType
  dbXrefs: Xref[]
}

/**
 * Where a reader goes for an accession.
 *
 * A hum label resolves at the bare address rather than at `/research/{humId}`,
 * because that is the address DDBJ Search has been building all along and the
 * one the portal promises to keep answering forever.
 */
export function xrefOf(type: AccessionType, identifier: string, origin: string): Xref {
  const url = type === "humandbs"
    ? `${origin}/${encodeURIComponent(identifier)}`
    : `${SEARCH_ENTRY_BASE}/${type}/${encodeURIComponent(identifier)}`
  return { identifier, type, url }
}

/**
 * One edge of the correspondence, before it is turned round for whichever side
 * was asked about.
 */
export interface Edge {
  accession: string
  type: JgaType
  /** The primary hum label, which is the one whose address answers. */
  humLabel: string
}

function compareXrefs(a: Xref, b: Xref): number {
  return a.type === b.type
    ? a.identifier.localeCompare(b.identifier)
    : a.type.localeCompare(b.type)
}

/**
 * The edges grouped by whichever side is the subject, in a deterministic order:
 * subjects by identifier, cross-references by type and then identifier. A
 * consumer diffing two runs should see a difference only where the data
 * differs.
 */
export function linksBySubject(
  edges: readonly Edge[],
  subject: AccessionType,
  origin: string,
): DbLinks[] {
  const grouped = new Map<string, Xref[]>()
  const add = (identifier: string, xref: Xref): void => {
    const held = grouped.get(identifier) ?? []
    held.push(xref)
    grouped.set(identifier, held)
  }

  for (const edge of edges) {
    if (subject === "humandbs") {
      add(edge.humLabel, xrefOf(edge.type, edge.accession, origin))
    } else if (edge.type === subject) {
      add(edge.accession, xrefOf("humandbs", edge.humLabel, origin))
    }
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([identifier, xrefs]) => ({
      identifier,
      type: subject,
      dbXrefs: xrefs.sort(compareXrefs),
    }))
}

/**
 * What one accession links to. Absent and unpublished both come out empty.
 *
 * It answers by grouping everything and then taking one, rather than by a
 * lookup of its own: the correspondence is on the order of a thousand edges, and
 * one way of reading it means a point lookup cannot disagree with the listing.
 */
export function linksOfSubject(
  edges: readonly Edge[],
  subject: AccessionType,
  identifier: string,
  origin: string,
): DbLinks {
  const found = linksBySubject(edges, subject, origin)
    .find((links) => links.identifier === identifier)
  return found ?? { identifier, type: subject, dbXrefs: [] }
}
