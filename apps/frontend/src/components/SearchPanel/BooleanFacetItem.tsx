import { useTranslations } from "use-intl";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { FacetItemWrapper } from "./FacetItemWrapper";

export function BooleanFacetItem({
  id,
  draftValue,
  onUpdate,
  facetCounts,
}: {
  id: string;
  draftValue: boolean | undefined;
  onUpdate: (id: string, value: unknown) => void;
  facetCounts?: { value: string; count: number }[];
}) {
  const isEnabled = draftValue != null;

  const realOptions = ["true", "false"];

  const t = useTranslations(`Filters.${id}.options` as any) as any;

  return (
    <FacetItemWrapper
      id={id}
      hasValue={isEnabled}
      onReset={() => {
        onUpdate(id, undefined);
      }}
    >
      <div className="space-y-2">
        <RadioGroup
          value={String(draftValue)}
          onValueChange={(val) => {
            onUpdate(id, val === "true");
          }}
        >
          {realOptions.map((option) => (
            <Label
              key={option}
              className="flex items-center justify-between gap-2 text-gray-700 text-sm"
            >
              <span>
                <RadioGroupItem value={option} />
                <span className="ml-2">{t(option)}</span>
              </span>
              <span className="text-gray-500">
                {facetCounts?.find((f) => f.value === (option === "true" ? "1" : "0"))?.count || 0}
              </span>
            </Label>
          ))}
        </RadioGroup>
      </div>
    </FacetItemWrapper>
  );
}
