import { Search as SearchIcon } from "lucide-react";
import { useTranslations } from "use-intl";

import { useEffect, useState } from "react";

import { Input as SearchInput } from "@/components/Input";

import { FacetItemWrapper } from "./FacetItemWrapper";

export function TextFacetItem({
  id,
  draftValue,
  onUpdate,
}: {
  id: string;
  draftValue: string;
  onUpdate: (id: string, value: unknown) => void;
}) {
  const [value, setValue] = useState(draftValue);
  const hasValue = value.trim().length > 0;

  useEffect(() => {
    setValue(draftValue);
  }, [draftValue]);

  return (
    <FacetItemWrapper
      id={id}
      hasValue={hasValue}
      onReset={() => {
        setValue("");
        onUpdate(id, undefined);
      }}
    >
      <SearchInput
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        onBlur={(e) => {
          if (e.currentTarget.value !== draftValue) {
            onUpdate(id, e.currentTarget.value);
          }
        }}
        placeholder={useTranslations("common")("search")}
        beforeIcon={<SearchIcon size={16} className="ml-1 text-muted-foreground" />}
        className="-mx-[2px] h-[28px] text-sm"
      />
    </FacetItemWrapper>
  );
}
