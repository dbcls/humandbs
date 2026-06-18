import type { ResearchDetailResponse } from "@humandbs/backend/types";

import type { ResearchTemplateData } from "../../../../../../../../../../backend/src/api/types/templates";

type ResearchDetailData = ResearchDetailResponse["data"];

/**
 * Maps an existing research detail response into the template-data shape consumed
 * by the merge engine. The editable research-level fields (title, summary,
 * dataProvider, researchProject, grant, relatedPublication) share the same shared
 * sub-schemas across both shapes, so they pass through unchanged. The J-DS-only
 * fields are stubbed: there are no related accessions or assembly warnings when
 * the source is an existing research.
 */
export function researchDetailToTemplate(data: ResearchDetailData): ResearchTemplateData {
  return {
    humId: data.humId ?? "",
    title: data.title ?? { ja: null, en: null },
    summary: data.summary ?? {
      aims: { ja: null, en: null },
      methods: { ja: null, en: null },
      targets: { ja: null, en: null },
      url: { ja: [], en: [] },
    },
    dataProvider: data.dataProvider ?? [],
    researchProject: data.researchProject ?? [],
    grant: data.grant ?? [],
    relatedPublication: data.relatedPublication ?? [],
    uids: data.uids ?? [],
    relatedAccessions: { jgad: [] },
    warnings: [],
  };
}
