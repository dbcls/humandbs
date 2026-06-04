/**
 * JGAD -> Dataset template payload
 *
 * JGAD's public metadata (DDBJ Search API) carries dataset-level descriptors
 * only (TITLE / DESCRIPTION / DATASET_TYPE). DRX-equivalent per-sample
 * attributes are not surfaced in the public layer for controlled-access JGA
 * data, so the experiments[] of a JGAD-seeded template is empty and admins
 * fill it in manually (or via a follow-up jga-shinsei DB lookup).
 *
 * `getJgadEntry` bypasses the crawler-side jgad cache so the admin always
 * sees the latest upstream metadata; otherwise stale cache could propagate
 * into the public ES doc via admin POST.
 */
import type { DatasetTemplateData } from "@/api/types/templates"
import { getJgadEntry } from "@/crawler/api/jga"

interface JgadProperties {
  TITLE?: string
  DESCRIPTION?: string
  DATASET_TYPE?: string | string[]
  [k: string]: unknown
}

const orNull = (s: string | null | undefined): string | null =>
  s?.trim() ? s : null

const formatTypeOfDataEn = (props: JgadProperties): string | null => {
  const direct = orNull(props.TITLE)
  if (direct) return direct
  const dt = props.DATASET_TYPE
  if (Array.isArray(dt)) {
    const filtered = dt.filter((s): s is string => typeof s === "string" && s.trim() !== "")
    return filtered.length ? filtered.join(", ") : null
  }
  return orNull(typeof dt === "string" ? dt : null)
}

/**
 * Build a dataset template from a JGAD accession.
 *
 * Returns null when the JGAD entry is not present (caller -> 404). 5xx /
 * network errors from DDBJ Search are absorbed by fetchJgadFromApi today
 * (it returns null on non-OK), so this function never throws.
 *
 * `requestId` is accepted for symmetry with the DRA mapper / future logger
 * correlation; it is currently unused because getJgadEntry does not propagate
 * X-Request-ID.
 */
export const mapJgadToDatasetTemplate = async (
  jgadId: string,
  _requestId?: string,
): Promise<DatasetTemplateData | null> => {
  const entry = await getJgadEntry(jgadId)
  if (!entry) return null

  return {
    datasetId: undefined,
    releaseDate: entry.datePublished ?? undefined,
    criteria: "Controlled-access (Type II)",
    typeOfData: {
      ja: null,
      en: formatTypeOfDataEn(entry.properties),
    },
    experiments: [],
    warnings: [],
  }
}
