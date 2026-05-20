import type { RangeFilter } from "@humandbs/backend/types";
import { Input as SearchInput } from "@/components/Input";
import { cn } from "@/lib/utils";
import { FacetItemWrapper } from "./FacetItemWrapper";

export function RangeFacetItem({
  id,
  draftValue,
  onUpdate,
  inputType = "number",
}: {
  id: string;
  draftValue: RangeFilter;
  onUpdate: (id: string, value: unknown) => void;
  inputType?: "number" | "date";
}) {
  const hasValue = draftValue.min != null || draftValue.max != null;

  const isDate = inputType === "date";

  return (
    <FacetItemWrapper
      id={id}
      hasValue={hasValue}
      onReset={() => {
        onUpdate(id, undefined);
      }}
    >
      <div className={cn("flex items-center", isDate ? "gap-1" : "gap-2")}>
        <SearchInput
          type={inputType}
          placeholder={isDate ? "From" : "Min"}
          value={(draftValue.min as string) ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            onUpdate(id, {
              ...draftValue,
              min: val === "" ? undefined : isDate ? val : Number(val),
            });
          }}
          className={cn(
            "h-[28px] flex-1 -mx-[2px]",
            isDate ? "text-xs min-w-0 [&_input]:px-1" : "text-sm",
          )}
        />
        <span className="text-muted-foreground text-xs">—</span>
        <SearchInput
          type={inputType}
          placeholder={isDate ? "To" : "Max"}
          value={(draftValue.max as string) ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            onUpdate(id, {
              ...draftValue,
              max: val === "" ? undefined : isDate ? val : Number(val),
            });
          }}
          className={cn(
            "h-[28px] flex-1 -mx-[2px]",
            isDate ? "text-xs min-w-0 [&_input]:px-1" : "text-sm",
          )}
        />
      </div>
    </FacetItemWrapper>
  );
}
