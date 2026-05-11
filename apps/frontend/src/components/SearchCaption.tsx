import { Filter, Search, X } from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import { useTranslations } from "use-intl";

import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SearchCaption({
  title,
  filtersCount,
  committedQuery,
  onQueryChange,
  onFilterClick,
  resultsCount,
  isPanelOpen,
  onCopy,
  onCsv,
  onExcel,
  onResetFilters,
}: {
  title: string;
  filtersCount: number | undefined;
  committedQuery: string;
  onQueryChange: (query: string | undefined) => void;
  onFilterClick: () => void;
  resultsCount: React.ReactNode;
  isPanelOpen: boolean;
  onCopy?: () => void;
  onCsv?: () => void;
  onExcel?: () => void;
  onResetFilters: () => void;
}) {
  const t = useTranslations("common");
  const [inputValue, setInputValue] = useState(committedQuery);

  useEffect(() => {
    setInputValue(committedQuery);
  }, [committedQuery]);

  return (
    <div className="flex h-fit items-center justify-between">
      <div className="flex items-baseline gap-10">
        <h3 className="text-lg relative before:absolute before:-left-6 before:h-full before:w-2 before:bg-secondary pl-3">{title}</h3>
        {resultsCount}
      </div>

      <div className="flex gap-4">
        <div className="mt-0.5 flex gap-1">
          <Button
            variant={"tableAction"}
            className="h-fit"
            size={"tableAction"}
            onClick={onCopy}
          >
            {t("copy")}
          </Button>
          <Button
            variant={"tableAction"}
            className="h-fit"
            size={"tableAction"}
            onClick={onCsv}
          >
            CSV
          </Button>
          <Button
            variant={"tableAction"}
            className="h-fit"
            size={"tableAction"}
            onClick={onExcel}
          >
            Excel
          </Button>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Input
            type="text"
            placeholder={t("search")}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
            }}
            beforeIcon={<Search size={22} />}
            afterIcon={
              <Button
                variant={"plain"}
                size={"icon"}
                className={"text-foreground-light pointer-events-auto"}
                disabled={!committedQuery}
                onClick={() => {
                  setInputValue("");
                  startTransition(() => {
                    onQueryChange(undefined);
                  });
                }}
              >
                <X size={22} />
              </Button>
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                startTransition(() => {
                  onQueryChange(inputValue || undefined);
                });
              }
            }}
          />
          <div
            itemType="button"
            className={cn(
              "text-secondary-light border-secondary-light pointer-events-auto flex cursor-pointer items-center gap-2 rounded-full border px-3 text-xs hover:opacity-100",
              {
                "opacity-50": !isPanelOpen,
              },
            )}
            onClick={onFilterClick}
          >
            <Filter size={10} />
            <span>
              {filtersCount && filtersCount > 0 ? (
                <span className="mr-1">{filtersCount}</span>
              ) : null}
              Filters
            </span>
            {filtersCount && filtersCount > 0 ? (
              <Button
                variant={"ghost"}
                className="p-0 text-inherit"
                size={"icon"}
                onClick={(e) => {
                  e.stopPropagation();
                  onResetFilters();
                }}
              >
                <X size={10} />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
