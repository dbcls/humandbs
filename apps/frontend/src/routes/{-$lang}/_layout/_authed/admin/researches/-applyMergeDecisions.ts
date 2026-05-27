import type { FieldDecision, MergeFieldDescriptor } from "./-computeMergeFields";
import type { EditableResearchValues } from "./-jdsResearchValues";

type DecisionsMap = Record<string, FieldDecision>;
type CustomValuesMap = Record<string, unknown>;

function resolveValue(
  field: MergeFieldDescriptor,
  decision: FieldDecision,
  customValue: unknown,
): unknown {
  if (decision === "custom" && customValue !== undefined) return customValue;
  if (decision === "accepted") return field.incomingValue;
  // rejected or pending → keep current
  return field.currentValue;
}

export function applyMergeDecisions(
  fields: MergeFieldDescriptor[],
  decisions: DecisionsMap,
  customValues: CustomValuesMap,
): EditableResearchValues {
  function get(key: string): unknown {
    const field = fields.find((f) => f.key === key);
    if (!field) return null;
    const decision = decisions[key] ?? "pending";
    const customValue = customValues[key];
    return resolveValue(field, decision, customValue);
  }

  const titleJa = get("title.ja") as string | null;
  const titleEn = get("title.en") as string | null;

  type TextValue = { text: string } | null;

  const aimsJa = get("summary.aims.ja") as TextValue;
  const aimsEn = get("summary.aims.en") as TextValue;
  const methodsJa = get("summary.methods.ja") as TextValue;
  const methodsEn = get("summary.methods.en") as TextValue;
  const targetsJa = get("summary.targets.ja") as TextValue;
  const targetsEn = get("summary.targets.en") as TextValue;

  type UrlValue = { text: string; url: string };

  const urlJa = get("summary.url.ja") as UrlValue[];
  const urlEn = get("summary.url.en") as UrlValue[];

  return {
    title: { ja: titleJa, en: titleEn },
    summary: {
      aims: { ja: aimsJa, en: aimsEn },
      methods: { ja: methodsJa, en: methodsEn },
      targets: { ja: targetsJa, en: targetsEn },
      url: { ja: urlJa ?? [], en: urlEn ?? [] },
    },
    dataProvider: (get("dataProvider") as EditableResearchValues["dataProvider"]) ?? [],
    researchProject: (get("researchProject") as EditableResearchValues["researchProject"]) ?? [],
    grant: (get("grant") as EditableResearchValues["grant"]) ?? [],
    relatedPublication:
      (get("relatedPublication") as EditableResearchValues["relatedPublication"]) ?? [],
  };
}
