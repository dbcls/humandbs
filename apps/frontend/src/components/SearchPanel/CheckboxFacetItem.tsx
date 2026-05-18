import { useState } from "react";
import { useTranslations } from "use-intl";
import { Search as SearchIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input as SearchInput } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FacetItemWrapper } from "./FacetItemWrapper";

type CheckboxSortMode = "name" | "count";
type CheckboxSortDir = "asc" | "desc" | undefined;

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: CheckboxSortDir;
  onClick: () => void;
}) {
  return (
    <p className="flex items-center gap-1 text-gray-700">
      <span>{label}</span>
      <Button
        type="button"
        onClick={onClick}
        variant={"ghost"}
        size={"icon"}
        className={"h-8 w-8 text-gray-700 hover:bg-hover"}
      >
        <span className="flex flex-col items-center justify-center text-[8px] leading-[0.8]">
          <span className={cn("inline-block scale-y-[0.6] scale-x-125", dir === "asc" ? "opacity-100" : "opacity-40")}>▲</span>
          <span className={cn("inline-block scale-y-[0.6] scale-x-125", dir === "desc" ? "opacity-100" : "opacity-40")}>▼</span>
        </span>
      </Button>
    </p>
  );
}

export function CheckboxFacetItem({
  id,
  draftValue,
  onUpdate,
  options,
  facetCounts,
  isFetching,
}: {
  id: string;
  draftValue: unknown;
  onUpdate: (id: string, value: unknown) => void;
  options: string[];
  facetCounts?: { value: string; count: number }[];
  isFetching: boolean;
}) {
  const selectedValues = Array.isArray(draftValue)
    ? (draftValue as string[])
    : [];
  const hasValue = selectedValues.length > 0;
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<CheckboxSortMode>("count");
  const [sortDir, setSortDir] = useState<CheckboxSortDir>("desc");

  const tFilters = useTranslations("Filters") as any;
  const tCommon = useTranslations("common");

  if (options.length === 0) return null;

  const getLabel = (optionValue: string): string => {
    const key = `${id}.options.${optionValue}` as any;
    if (tFilters.has(key)) {
      return tFilters(key);
    }
    return optionValue;
  };

  const handleSortClick = (mode: CheckboxSortMode) => {
    if (sortMode === mode) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortMode(mode);
      setSortDir(mode === "count" ? "desc" : "asc");
    }
  };

  const showSearch = options.length > 9;

  const filteredOptions =
    showSearch && search.trim()
      ? options.filter((optionValue) => {
          const q = search.trim().toLowerCase();
          if (optionValue.toLowerCase().includes(q)) return true;
          return getLabel(optionValue).toLowerCase().includes(q);
        })
      : [...options];

  filteredOptions.sort((a, b) => {
    let cmp: number;
    if (sortMode === "name") {
      cmp = getLabel(a).localeCompare(getLabel(b));
    } else {
      const countA = facetCounts?.find((f) => f.value === a)?.count ?? 0;
      const countB = facetCounts?.find((f) => f.value === b)?.count ?? 0;
      cmp = countA - countB;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <FacetItemWrapper
      id={id}
      hasValue={hasValue}
      onReset={() => {
        onUpdate(id, undefined);
      }}
    >
      {showSearch && (
        <SearchInput
          className="mb-2 h-[28px] text-sm -mx-[2px]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tCommon("search")}
          beforeIcon={<SearchIcon size={16} className="text-muted-foreground ml-1" />}
        />
      )}
      <div className="text-gray-700 mb-1 flex items-center justify-between gap-2 text-sm font-medium">
        <SortButton
          label={tFilters("sort-by-name")}
          active={sortMode === "name"}
          dir={sortMode === "name" ? sortDir : undefined}
          onClick={() => handleSortClick("name")}
        />
        <SortButton
          label={tFilters("sort-by-count")}
          active={sortMode === "count"}
          dir={sortMode === "count" ? sortDir : undefined}
          onClick={() => handleSortClick("count")}
        />
      </div>
      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {filteredOptions.map((optionValue) => {
          const isChecked = selectedValues.includes(optionValue);
          const count =
            facetCounts?.find((f) => f.value === optionValue)?.count ?? 0;

          return (
            <li key={`${id}-${optionValue}`}>
              <Label className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 text-sm text-gray-700">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    const nextValues =
                      checked === true
                        ? Array.from(new Set([...selectedValues, optionValue]))
                        : selectedValues.filter((v) => v !== optionValue);

                    onUpdate(
                      id,
                      nextValues.length > 0 ? nextValues : undefined,
                    );
                  }}
                />
                <span
                  className={cn({
                    "opacity-40": isFetching,
                  })}
                >
                  {getLabel(optionValue)}
                </span>
                <span className="text-gray-500">{count}</span>
              </Label>
            </li>
          );
        })}
      </ul>
    </FacetItemWrapper>
  );
}
