import { useTranslations } from "use-intl";
import { Search as SearchIcon } from "lucide-react";
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
  const hasValue = draftValue.trim().length > 0;

  return (
    <FacetItemWrapper
      id={id}
      hasValue={hasValue}
      onReset={() => {
        onUpdate(id, undefined);
      }}
    >
      <SearchInput
        type="text"
        value={draftValue}
        onChange={(e) => {
          onUpdate(id, e.target.value);
        }}
        placeholder={useTranslations("common")("search")}
        beforeIcon={<SearchIcon size={16} className="text-muted-foreground ml-1" />}
        className="h-[28px] text-sm -mx-[2px]"
      />
    </FacetItemWrapper>
  );
}
