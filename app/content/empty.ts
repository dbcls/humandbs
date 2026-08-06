import type {
  DatasetContent,
  ResearchContent,
  Slot,
  TranslatedRichText,
  TranslatedText,
} from "./types"

/**
 * The starting point for a new research or dataset.
 *
 * Every named field is present and holds an empty value rather than being
 * absent or `unknown`: an empty translated pair means "nobody has filled this
 * in", which is a different thing from "there is a value but it is not settled"
 * (`unknown`, which the publish gate lists) and from "there is no value"
 * (`not-applicable`, which is settled and gets rendered).
 */
export function emptyResearchContent(): ResearchContent {
  return {
    title: emptyTranslated(),
    summary: {
      aims: emptyRich(),
      methods: emptyRich(),
      targets: emptyRich(),
      url: { state: "value", value: { ja: [], en: [] } },
    },
    summaryShort: {
      methods: emptyRich(),
      targets: emptyRich(),
      typeOfData: emptyRich(),
    },
    releaseNote: emptyRich(),
    dataProviders: [],
    researchProjects: [],
    grants: [],
    relatedPublications: [],
    datasetIds: [],
  }
}

export function emptyDatasetContent(): DatasetContent {
  return {
    releaseDate: null,
    fileSelection: [],
    values: [],
    experiments: [],
  }
}

function emptyTranslated(): Slot<TranslatedText> {
  return { state: "value", value: { ja: "", en: "" } }
}

/** No lines at all, which is what "nobody has written anything" looks like. */
function emptyRich(): Slot<TranslatedRichText> {
  return { state: "value", value: { ja: [], en: [] } }
}
