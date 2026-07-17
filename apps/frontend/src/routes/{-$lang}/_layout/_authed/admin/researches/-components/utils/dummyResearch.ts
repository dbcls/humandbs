import type { ResearchSummary } from "@humandbs/backend/types";

export const DUMMY_HUM_ID = "new-research" as const;

export function createDummyResearch(lang: string): ResearchSummary {
  return {
    humId: DUMMY_HUM_ID,
    lang: lang as ResearchSummary["lang"],
    title: { ja: "New Research", en: "New Research" },
    versions: [],
    methods: "",
    datasetIds: [],
    typeOfData: [],
    platforms: [],
    targets: "",
    methodsSummary: null,
    typeOfDataSummary: null,
    targetsSummary: null,
    dataProvider: [],
    criteria: [],
    status: "draft",
  };
}

export function isDummyResearch(humId: string): boolean {
  return humId === DUMMY_HUM_ID;
}
