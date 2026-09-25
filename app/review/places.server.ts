/**
 * What names the places of a draft's comments (`components/places.ts`), read
 * for the screens that list the open comments. **Read from what is saved**: the
 * two editors put what their forms hold over the part they edit, so a row moved
 * or renamed before saving is named as the screen shows it.
 */

import { datasetContentInput } from "~/admin/dataset-form"
import { researchContentInput } from "~/admin/form"
import { draftDatasetIds, humLabelOf, loadEditableCatalog, researchDatasets } from "~/admin/queries.server"
import { placeExperiments, placeRows, type PlaceSources } from "~/components/places"
import type { ResearchContent } from "~/content/types"
import type { Executor } from "~/db/client.server"
import { catalogLabel } from "~/i18n/catalog-label"
import type { Locale } from "~/i18n/locale"

import { previewDatasets } from "./queries.server"

export async function placeSources(
  db: Executor,
  researchId: string,
  draftId: string,
  content: ResearchContent,
  locale: Locale,
): Promise<PlaceSources> {
  const [humLabel, datasets, listed, catalog] = await Promise.all([
    humLabelOf(db, researchId),
    researchDatasets(db, researchId),
    draftDatasetIds(db, draftId, researchId, content.datasetIds),
    loadEditableCatalog(db),
  ])
  // Every dataset of the research, not only the listed ones: an administrator
  // can leave a comment on one this draft does not publish.
  const described = await previewDatasets(db, draftId, datasets.map((row) => row.id))
  return {
    humLabel,
    rows: placeRows(researchContentInput(content), locale),
    datasets: datasets.map((row) => {
      const at = listed.indexOf(row.id)
      return { id: row.id, label: row.label, number: at < 0 ? null : at + 1 }
    }),
    experiments: Object.fromEntries(described.map((row) => [row.id, placeExperiments(datasetContentInput(row.content))])),
    keyLabels: Object.fromEntries(catalog.keys.map((key) => [key.id, catalogLabel(key, locale)])),
  }
}
