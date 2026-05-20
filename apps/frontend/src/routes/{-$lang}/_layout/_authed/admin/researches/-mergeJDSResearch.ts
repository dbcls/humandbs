import type {
  CreateResearchRequest,
  ResearchDetailResponse,
} from "@humandbs/backend/types";
import type { ResearchTemplateData } from "../../../../../../../../backend/src/api/types/templates";

type ResearchValues = ResearchDetailResponse["data"];
type IncomingResearchValues = ResearchTemplateData;
type BilingualText = { ja: string | null; en: string | null };
type SummaryTextValue = { ja: { text: string } | null; en: { text: string } | null };
type UrlValue = { text: string; url: string };
type SummaryUrlValue = { ja: UrlValue[]; en: UrlValue[] };

const editableFields = [
  "title",
  "summary",
  "dataProvider",
  "researchProject",
  "grant",
  "relatedPublication",
] as const;

export type EditableResearchField = (typeof editableFields)[number];
export type EditableResearchValues = {
  title: BilingualText;
  summary: {
    aims: SummaryTextValue;
    methods: SummaryTextValue;
    targets: SummaryTextValue;
    url: SummaryUrlValue;
  };
  dataProvider: NonNullable<ResearchTemplateData["dataProvider"]>;
  researchProject: NonNullable<ResearchTemplateData["researchProject"]>;
  grant: NonNullable<ResearchTemplateData["grant"]>;
  relatedPublication: NonNullable<ResearchTemplateData["relatedPublication"]>;
};

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
  incoming: BilingualText,
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
  current: SummaryTextValue,
  incoming: SummaryTextValue,
): SummaryTextValue {
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
  const title = mergeBilingualText(
    current.title ?? { ja: null, en: null },
    incoming.title ?? { ja: null, en: null },
  );
  const summary = {
    aims: mergeBilingualTextValue(
      current.summary?.aims ?? { ja: null, en: null },
      incoming.summary?.aims ?? { ja: null, en: null },
    ),
    methods: mergeBilingualTextValue(
      current.summary?.methods ?? { ja: null, en: null },
      incoming.summary?.methods ?? { ja: null, en: null },
    ),
    targets: mergeBilingualTextValue(
      current.summary?.targets ?? { ja: null, en: null },
      incoming.summary?.targets ?? { ja: null, en: null },
    ),
    url: {
      ja: mergeArray(current.summary?.url?.ja ?? [], incoming.summary?.url?.ja ?? []),
      en: mergeArray(current.summary?.url?.en ?? [], incoming.summary?.url?.en ?? []),
    },
  };
  const dataProvider = mergeArray(current.dataProvider ?? [], incoming.dataProvider ?? []);
  const researchProject = mergeArray(
    current.researchProject ?? [],
    incoming.researchProject ?? [],
  );
  const grant = mergeArray(current.grant ?? [], incoming.grant ?? []);
  const relatedPublication = mergeArray(
    current.relatedPublication ?? [],
    incoming.relatedPublication ?? [],
  );

  const values: EditableResearchValues = {
    title,
    summary,
    dataProvider: dataProvider as EditableResearchValues["dataProvider"],
    researchProject: researchProject as EditableResearchValues["researchProject"],
    grant: grant as EditableResearchValues["grant"],
    relatedPublication: relatedPublication as EditableResearchValues["relatedPublication"],
  };

  const changedFields = editableFields.filter((field) =>
    didChange((current as Record<string, unknown>)[field], (values as Record<string, unknown>)[field]),
  );

  return { values, changedFields };
}

export function toResearchValuesForMerge(
  value: CreateResearchRequest,
): ResearchTemplateData {
  return {
    humId: value.humId ?? "",
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
    uids: value.uids ?? [],
    relatedAccessions: { jgad: [] },
    warnings: [],
  };
}

export function pickNewResearchMergeValues(
  values: MergeResearchResult["values"],
): NewResearchMergeValues {
  return {
    title: values.title,
    summary: values.summary as unknown as CreateResearchRequest["summary"],
    dataProvider: values.dataProvider as CreateResearchRequest["dataProvider"],
    researchProject:
      values.researchProject as CreateResearchRequest["researchProject"],
    grant: values.grant as CreateResearchRequest["grant"],
    relatedPublication:
      values.relatedPublication as CreateResearchRequest["relatedPublication"],
  };
}
