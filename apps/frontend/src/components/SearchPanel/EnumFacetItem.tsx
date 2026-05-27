import { useTranslations } from "use-intl";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { FacetItemWrapper } from "./FacetItemWrapper";

export function EnumFacetItem({
  id,
  options,
  draftValue,
  onUpdate,
}: {
  id: string;
  options: string[];
  draftValue: string | undefined;
  onUpdate: (id: string, value: unknown) => void;
}) {
  const t = useTranslations(`Filters.${id}.options` as any) as any;

  const realOptions = ["any", ...options];
  const isEnabled = draftValue != null && draftValue !== "any";

  return (
    <FacetItemWrapper
      id={id}
      hasValue={isEnabled}
      onReset={() => {
        onUpdate(id, undefined);
      }}
    >
      <div>
        <RadioGroup
          value={draftValue || "any"}
          onValueChange={(val) => {
            if (val === "any") {
              onUpdate(id, undefined);
              return;
            }
            onUpdate(id, val);
          }}
        >
          {realOptions.map((option) => (
            <Label key={option} className="flex items-center gap-2">
              <RadioGroupItem value={option} />
              <span>{t(option)}</span>
            </Label>
          ))}
        </RadioGroup>
      </div>
    </FacetItemWrapper>
  );
}
