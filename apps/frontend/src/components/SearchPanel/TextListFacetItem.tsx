import { Plus, Trash2 } from "lucide-react";
import { Input as SearchInput } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FacetItemWrapper } from "./FacetItemWrapper";

export function TextListFacetItem({
  id,
  draftValue,
  onUpdate,
}: {
  id: string;
  draftValue: string[];
  onUpdate: (id: string, value: unknown) => void;
}) {
  const hasValue = draftValue.some((v) => v.trim().length > 0);

  const handleChange = (index: number, next: string) => {
    const updated = [...draftValue];
    updated[index] = next;
    onUpdate(id, updated);
  };

  const handleRemove = (index: number) => {
    const updated = draftValue.filter((_, i) => i !== index);
    onUpdate(id, updated.length > 0 ? updated : undefined);
  };

  const handleAdd = () => {
    onUpdate(id, [...draftValue, ""]);
  };

  return (
    <FacetItemWrapper
      id={id}
      hasValue={hasValue}
      onReset={() => {
        onUpdate(id, undefined);
      }}
      headerAction={
        <Button
          variant="tableAction"
          className="size-[21px] p-0 shrink-0 flex items-center justify-center"
          onClick={handleAdd}
        >
          <Plus className="size-4" />
        </Button>
      }
    >
      <div className="space-y-2">
        {draftValue.map((val, index) => (
          <div key={index} className="flex items-center gap-1">
            <SearchInput
              type="text"
              value={val}
              onChange={(e) => {
                handleChange(index, e.target.value);
              }}
              placeholder={`${id}...`}
              className={cn("h-[28px] flex-1 text-sm -mx-[2px]")}
            />
            <Button
              variant="tableAction"
              className="size-[21px] shrink-0 p-0 flex items-center justify-center"
              onClick={() => {
                handleRemove(index);
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </FacetItemWrapper>
  );
}
