import type {
  CreateResearchRequest,
  ResearchDetailResponse,
} from "@humandbs/backend/types";
import type { DeepOmit } from "@/utils/typeUtils";

type ResearchValues = ResearchDetailResponse["data"];
type IncomingResearchValues = DeepOmit<ResearchValues, "rawHtml">;
type BilingualText = ResearchValues["title"];
type MergeBilingualTextValue =
  | ResearchValues["summary"]["aims"]
  | IncomingResearchValues["summary"]["aims"];

const editableFields = [
  "title",
  "summary",
  "dataProvider",
  "researchProject",
  "grant",
  "relatedPublication",
  "controlledAccessUser",
] as const;

export type EditableResearchField = (typeof editableFields)[number];
export type EditableResearchValues = DeepOmit<
  Pick<ResearchValues, EditableResearchField>,
  "rawHtml"
>;

export type MergeResearchResult = {
  values: EditableResearchValues;
  changedFields: EditableResearchField[];
};

const newResearchFields = [
  "title",
  "summary",
  "dataProvider",
  "researchProject",
  "grant",
  "relatedPublication",
] as const satisfies readonly (keyof CreateResearchRequest)[];

export type NewResearchMergeValues = Pick<
  CreateResearchRequest,
  (typeof newResearchFields)[number]
>;

function isEmptyString(value: string | null | undefined) {
  return value == null || value.trim() === "";
}

function isEmptyTextValue(value: { text?: string | null } | null | undefined) {
  return value == null || isEmptyString(value.text);
}

function mergeBilingualText(
  current: BilingualText,
  incoming: DeepOmit<BilingualText, "rawHtml">,
): BilingualText {
  return {
    ja:
      isEmptyString(current.ja) && !isEmptyString(incoming.ja)
        ? incoming.ja
        : current.ja,
    en:
      isEmptyString(current.en) && !isEmptyString(incoming.en)
        ? incoming.en
        : current.en,
  };
}

function mergeBilingualTextValue(
  current: MergeBilingualTextValue,
  incoming: DeepOmit<ResearchValues["summary"]["aims"], "rawHtml">,
): DeepOmit<ResearchValues["summary"]["aims"], "rawHtml"> {
  return {
    ja:
      isEmptyTextValue(current.ja) && !isEmptyTextValue(incoming.ja)
        ? incoming.ja
        : current.ja,
    en:
      isEmptyTextValue(current.en) && !isEmptyTextValue(incoming.en)
        ? incoming.en
        : current.en,
  };
}

function mergeArray<T>(current: T[], incoming: T[]) {
  return current.length === 0 && incoming.length > 0 ? incoming : current;
}

function didChange<T>(current: T, merged: T) {
  return JSON.stringify(current) !== JSON.stringify(merged);
}

export function mergeEmptyResearchFields(
  current: ResearchValues | IncomingResearchValues,
  incoming: IncomingResearchValues,
): MergeResearchResult {
  const title = mergeBilingualText(current.title, incoming.title);
  const summary = {
    aims: mergeBilingualTextValue(current.summary.aims, incoming.summary.aims),
    methods: mergeBilingualTextValue(
      current.summary.methods,
      incoming.summary.methods,
    ),
    targets: mergeBilingualTextValue(
      current.summary.targets,
      incoming.summary.targets,
    ),
    url: {
      ja: mergeArray(current.summary.url.ja, incoming.summary.url.ja),
      en: mergeArray(current.summary.url.en, incoming.summary.url.en),
    },
  };
  const dataProvider = mergeArray(current.dataProvider, incoming.dataProvider);
  const researchProject = mergeArray(
    current.researchProject,
    incoming.researchProject,
  );
  const grant = mergeArray(current.grant, incoming.grant);
  const relatedPublication = mergeArray(
    current.relatedPublication,
    incoming.relatedPublication,
  );
  const controlledAccessUser = mergeArray(
    current.controlledAccessUser,
    incoming.controlledAccessUser,
  );

  const values = {
    title,
    summary,
    dataProvider,
    researchProject,
    grant,
    relatedPublication,
    controlledAccessUser,
  };

  const changedFields = editableFields.filter((field) =>
    didChange(current[field], values[field]),
  );

  return { values, changedFields };
}

export function toResearchValuesForMerge(
  value: CreateResearchRequest,
): DeepOmit<ResearchValues, "rawHtml"> {
  const now = new Date().toISOString();

  return {
    humId: value.humId ?? "",
    url: { ja: null, en: null },
    title: value.title ?? { ja: null, en: null },
    summary: value.summary ?? {
      aims: { ja: null, en: null },
      methods: { ja: null, en: null },
      targets: { ja: null, en: null },
      url: { ja: [], en: [] },
    },
    dataProvider: value.dataProvider ?? [],
    researchProject: value.researchProject ?? [],
    grant: value.grant ?? [],
    relatedPublication: value.relatedPublication ?? [],
    controlledAccessUser: [],
    latestVersion: null,
    datePublished: null,
    dateModified: now,
    status: "draft",
    uids: value.uids ?? [],
    draftVersion: null,
    humVersionId: "",
    version: "",
    versionReleaseDate: now,
    datasets: [],
    releaseNote: value.initialReleaseNote ?? { ja: null, en: null },
  };
}

export function pickNewResearchMergeValues(
  values: MergeResearchResult["values"],
): NewResearchMergeValues {
  return {
    title: values.title,
    summary: values.summary as CreateResearchRequest["summary"],
    dataProvider: values.dataProvider as CreateResearchRequest["dataProvider"],
    researchProject:
      values.researchProject as CreateResearchRequest["researchProject"],
    grant: values.grant as CreateResearchRequest["grant"],
    relatedPublication:
      values.relatedPublication as CreateResearchRequest["relatedPublication"],
  };
}
