import type { CriteriaCanonical } from "node_modules/@humandbs/backend/src/crawler/types";

import type {
  ResearchSearchResponse,
  DatasetDoc as ServerDatasetDoc,
  ResearchSummary as ServerResearchSummary,
} from "@humandbs/backend/types";

import type { StripIndexSignature } from "@/utils/type-utils";

export type DatasetDoc = StripIndexSignature<ServerDatasetDoc>;

export type AccessCriteria = DatasetDoc["criteria"];

export type ResearchSummary = Omit<ServerResearchSummary, "criteria"> & {
  criteria: CriteriaCanonical[];
};

export type ResearchSearchResponseWithTypedCriteria = Omit<ResearchSearchResponse, "data"> & {
  data: (Omit<ResearchSearchResponse["data"][number], "criteria"> & {
    criteria: CriteriaCanonical[];
  })[];
};
