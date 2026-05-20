import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input as SearchInput } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FacetItemWrapper } from "./FacetItemWrapper";

function areStringArraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function TextListFacetItem({
  id,
  draftValue,
  onUpdate,
}: {
  id: string;
  draftValue: string[];
  onUpdate: (id: string, value: unknown) => void;
}) {
  const [values, setValues] = useState(draftValue);
  const hasValue = values.some((v) => v.trim().length > 0);

  useEffect(() => {
    setValues(draftValue);
  }, [draftValue]);

  const handleChange = (index: number, next: string) => {
    const updated = [...values];
    updated[index] = next;
    setValues(updated);
  };

  const handleRemove = (index: number) => {
    const updated = values.filter((_, i) => i !== index);
    setValues(updated);
    onUpdate(id, updated.length > 0 ? updated : undefined);
  };

  const handleAdd = () => {
    setValues([...values, ""]);
  };

  const handleBlur = (index: number, next: string) => {
    const updated = [...values];
    updated[index] = next;
    if (!areStringArraysEqual(updated, draftValue)) {
      onUpdate(id, updated);
    }
  };

  return (
    <FacetItemWrapper
      id={id}
      hasValue={hasValue}
      onReset={() => {
        setValues([]);
        onUpdate(id, undefined);
      }}
      headerAction={
        <Button
          variant="tableAction"
          className="flex size-[21px] shrink-0 items-center justify-center p-0"
          onClick={handleAdd}
        >
          <Plus className="size-4" />
        </Button>
      }
    >
      <div className="space-y-2">
        {values.map((val, index) => (
          <div key={index} className="flex items-center gap-1">
            <SearchInput
              type="text"
              value={val}
              onChange={(e) => {
                handleChange(index, e.target.value);
              }}
              onBlur={(e) => {
                handleBlur(index, e.currentTarget.value);
              }}
              placeholder={`${id}...`}
              className={cn("h-[28px] flex-1 text-sm")}
            />
            <Button
              variant="tableAction"
              className="flex size-[21px] shrink-0 items-center justify-center p-0"
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
