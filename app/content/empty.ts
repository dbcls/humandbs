import type {
  DatasetContent,
  LocalizedLinks,
  ResearchContent,
  Slot,
  TranslatedRichText,
  TranslatedText,
} from "./types"

/**
 * The starting point for a new research or dataset.
 *
 * Every named field is present and holds an empty value in both languages
 * rather than being absent or `unknown`. An empty value means "nobody has
 * filled this in", which is a different thing from "there is a value but it is
 * not settled" (`unknown`, which the publish gate lists) and from "there is no
 * value" (`not-applicable`, which is settled and gets rendered). Each language
 * carries its own state, so a new content starts with both of them empty.
 */
export function emptyResearchContent(): ResearchContent {
  return {
    title: emptyTranslated(),
    summary: {
      aims: emptyRich(),
      methods: emptyRich(),
      targets: emptyRich(),
      url: emptyLinks(),
    },
    listingSummary: {
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

export function filled<T>(value: T): Slot<T> {
  return { state: "value", value }
}

function emptyTranslated(): TranslatedText {
  return { ja: filled(""), en: filled("") }
}

/** No lines at all, which is what "nobody has written anything" looks like. */
function emptyRich(): TranslatedRichText {
  return { ja: filled([]), en: filled([]) }
}

function emptyLinks(): LocalizedLinks {
  return { ja: filled([]), en: filled([]) }
}
