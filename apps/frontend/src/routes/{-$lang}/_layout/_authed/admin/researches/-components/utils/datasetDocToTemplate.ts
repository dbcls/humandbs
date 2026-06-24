import type { DatasetDoc } from "@/lib/types";

import type { DatasetTemplateData } from "../../../../../../../../../../backend/src/api/types/templates";

/**
 * Bridges an existing dataset's detail shape (`DatasetDoc`) into the template
 * shape (`DatasetTemplateData`) consumed by the new-dataset merge pipeline.
 *
 * Copies content, never identity: `datasetId` is intentionally omitted so the
 * merge preserves the form's current value. `releaseDate` and `criteria` are
 * normalized to `undefined` when null/absent (type-cleanliness against the
 * template type; the merge treats falsy incoming values as "no change").
 * `typeOfData` and `experiments` pass through — the detail and template
 * experiment shapes are structurally identical (`header`, `data`, optional
 * `searchable`); the detail's extra `rawHtml` is tolerated downstream.
 * Template-only extras (`relatedAccessions`, `warnings`) are not produced — the
 * merge pipeline never reads them, so they are omitted from the output.
 */
export function datasetDocToTemplate(doc: DatasetDoc): DatasetTemplateData {
  return {
    releaseDate: doc.releaseDate ?? undefined,
    criteria: doc.criteria ?? undefined,
    typeOfData: doc.typeOfData,
    experiments: doc.experiments as DatasetTemplateData["experiments"],
  } as DatasetTemplateData;
}
