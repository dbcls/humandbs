import type { ResearchTemplateData } from "../../../../../../../../../../backend/src/api/types/templates";
import type { EditableResearchValues } from "./jdsResearchValues";

export type FieldStatus = "conflict" | "can-fill" | "same" | "na";
export type FieldDataType =
  | "scalar"
  | "links"
  | "providers"
  | "projects"
  | "grants"
  | "publications";
export type FieldDecision = "pending" | "accepted" | "rejected" | "custom";

export type MergeFieldDescriptor = {
  key: string;
  group: string;
  label: string;
  schemaPath: string;
  dataType: FieldDataType;
  currentValue: unknown;
  incomingValue: unknown;
  status: FieldStatus;
};

type ResearchValues = EditableResearchValues | ResearchTemplateData;

function isEmptyString(v: string | null | undefined): boolean {
  return v == null || v.trim() === "";
}

function isEmptyTextValue(v: { text?: string | null } | null | undefined): boolean {
  return v == null || isEmptyString(v.text);
}

function isEmptyArray(v: unknown[] | null | undefined): boolean {
  return v == null || v.length === 0;
}

function scalarStatus(
  current: string | null | undefined,
  incoming: string | null | undefined,
): FieldStatus {
  const curEmpty = isEmptyString(current);
  const incEmpty = isEmptyString(incoming);
  if (incEmpty) return "na";
  if (curEmpty) return "can-fill";
  if (current === incoming) return "same";
  return "conflict";
}

function textValueStatus(
  current: { text?: string | null } | null | undefined,
  incoming: { text?: string | null } | null | undefined,
): FieldStatus {
  const curEmpty = isEmptyTextValue(current);
  const incEmpty = isEmptyTextValue(incoming);
  if (incEmpty) return "na";
  if (curEmpty) return "can-fill";
  if (current?.text === incoming?.text) return "same";
  return "conflict";
}

function arrayStatus(
  current: unknown[] | null | undefined,
  incoming: unknown[] | null | undefined,
): FieldStatus {
  const curEmpty = isEmptyArray(current);
  const incEmpty = isEmptyArray(incoming);
  if (incEmpty) return "na";
  if (curEmpty) return "can-fill";
  if (JSON.stringify(current) === JSON.stringify(incoming)) return "same";
  return "conflict";
}

export function computeMergeFields(
  current: ResearchValues,
  incoming: ResearchTemplateData,
): MergeFieldDescriptor[] {
  const fields: MergeFieldDescriptor[] = [];

  const curTitle = (current as ResearchTemplateData).title ?? { ja: null, en: null };
  const incTitle = incoming.title ?? { ja: null, en: null };

  fields.push({
    key: "title.ja",
    group: "Title",
    label: "Title (JA)",
    schemaPath: "title.ja",
    dataType: "scalar",
    currentValue: curTitle.ja ?? null,
    incomingValue: incTitle.ja ?? null,
    status: scalarStatus(curTitle.ja, incTitle.ja),
  });

  fields.push({
    key: "title.en",
    group: "Title",
    label: "Title (EN)",
    schemaPath: "title.en",
    dataType: "scalar",
    currentValue: curTitle.en ?? null,
    incomingValue: incTitle.en ?? null,
    status: scalarStatus(curTitle.en, incTitle.en),
  });

  const curSummary = (current as ResearchTemplateData).summary;
  const incSummary = incoming.summary;

  const summarySubFields = [
    {
      key: "summary.aims.ja",
      label: "Aims (JA)",
      path: "summary.aims.ja",
      cur: curSummary?.aims?.ja,
      inc: incSummary?.aims?.ja,
    },
    {
      key: "summary.aims.en",
      label: "Aims (EN)",
      path: "summary.aims.en",
      cur: curSummary?.aims?.en,
      inc: incSummary?.aims?.en,
    },
    {
      key: "summary.methods.ja",
      label: "Methods (JA)",
      path: "summary.methods.ja",
      cur: curSummary?.methods?.ja,
      inc: incSummary?.methods?.ja,
    },
    {
      key: "summary.methods.en",
      label: "Methods (EN)",
      path: "summary.methods.en",
      cur: curSummary?.methods?.en,
      inc: incSummary?.methods?.en,
    },
    {
      key: "summary.targets.ja",
      label: "Targets (JA)",
      path: "summary.targets.ja",
      cur: curSummary?.targets?.ja,
      inc: incSummary?.targets?.ja,
    },
    {
      key: "summary.targets.en",
      label: "Targets (EN)",
      path: "summary.targets.en",
      cur: curSummary?.targets?.en,
      inc: incSummary?.targets?.en,
    },
  ] as const;

  for (const sf of summarySubFields) {
    fields.push({
      key: sf.key,
      group: "Summary",
      label: sf.label,
      schemaPath: sf.path,
      dataType: "scalar",
      currentValue: sf.cur ?? null,
      incomingValue: sf.inc ?? null,
      status: textValueStatus(sf.cur, sf.inc),
    });
  }

  const curUrlJa = curSummary?.url?.ja ?? [];
  const incUrlJa = incSummary?.url?.ja ?? [];
  fields.push({
    key: "summary.url.ja",
    group: "Summary",
    label: "URL (JA)",
    schemaPath: "summary.url.ja",
    dataType: "links",
    currentValue: curUrlJa,
    incomingValue: incUrlJa,
    status: arrayStatus(curUrlJa, incUrlJa),
  });

  const curUrlEn = curSummary?.url?.en ?? [];
  const incUrlEn = incSummary?.url?.en ?? [];
  fields.push({
    key: "summary.url.en",
    group: "Summary",
    label: "URL (EN)",
    schemaPath: "summary.url.en",
    dataType: "links",
    currentValue: curUrlEn,
    incomingValue: incUrlEn,
    status: arrayStatus(curUrlEn, incUrlEn),
  });

  const curProviders = (current as ResearchTemplateData).dataProvider ?? [];
  const incProviders = incoming.dataProvider ?? [];
  fields.push({
    key: "dataProvider",
    group: "Data Provider",
    label: "Data Provider",
    schemaPath: "dataProvider",
    dataType: "providers",
    currentValue: curProviders,
    incomingValue: incProviders,
    status: arrayStatus(curProviders, incProviders),
  });

  const curProjects = (current as ResearchTemplateData).researchProject ?? [];
  const incProjects = incoming.researchProject ?? [];
  fields.push({
    key: "researchProject",
    group: "Research Project",
    label: "Research Project",
    schemaPath: "researchProject",
    dataType: "projects",
    currentValue: curProjects,
    incomingValue: incProjects,
    status: arrayStatus(curProjects, incProjects),
  });

  const curGrants = (current as ResearchTemplateData).grant ?? [];
  const incGrants = incoming.grant ?? [];
  fields.push({
    key: "grant",
    group: "Grant",
    label: "Grant",
    schemaPath: "grant",
    dataType: "grants",
    currentValue: curGrants,
    incomingValue: incGrants,
    status: arrayStatus(curGrants, incGrants),
  });

  const curPubs = (current as ResearchTemplateData).relatedPublication ?? [];
  const incPubs = incoming.relatedPublication ?? [];
  fields.push({
    key: "relatedPublication",
    group: "Publications",
    label: "Related Publication",
    schemaPath: "relatedPublication",
    dataType: "publications",
    currentValue: curPubs,
    incomingValue: incPubs,
    status: arrayStatus(curPubs, incPubs),
  });

  return fields;
}
