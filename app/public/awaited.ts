/**
 * Which of a dataset's upstream values a preview shows as still to come.
 *
 * The size, the formats, the dates and the JGA study are nobody's to write:
 * they are read from the archive once it publishes the dataset, or set when the
 * portal publishes it. A draft's dataset usually has none of them yet, and a
 * page that silently left them out would read to a provider as values that
 * were forgotten. **So a preview keeps their rows and shows that they are filled in
 * after publication**, and a published page leaves out what it does not have.
 *
 * A dataset the portal issued the ID for is the exception for its size and
 * formats: they come from the files linked to it, which show at once, so
 * having none is not something publication will change.
 */

import { isPortalIssuedId } from "~/admin/labels"

export type AwaitedItem = "dataVolume" | "fileFormats" | "datePublished" | "dateModified" | "studyAccession"

export function awaitedItems(view: {
  /** The dataset's primary ID; empty while none is pinned. */
  label: string
  dataVolume: number | null
  fileFormats: readonly string[]
  datePublished: string | null
  dateModified: string | null
  studyAccession: string | null
}): AwaitedItem[] {
  const filesLinked = isPortalIssuedId(view.label === "" ? null : view.label)
  return [
    ...!filesLinked && view.dataVolume === null ? ["dataVolume" as const] : [],
    ...!filesLinked && view.fileFormats.length === 0 ? ["fileFormats" as const] : [],
    ...view.datePublished === null ? ["datePublished" as const] : [],
    ...view.dateModified === null ? ["dateModified" as const] : [],
    // Only JGA files a dataset under a study.
    ...view.label.startsWith("JGAD") && view.studyAccession === null ? ["studyAccession" as const] : [],
  ]
}
