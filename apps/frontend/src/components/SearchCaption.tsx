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

        <div className="flex items-center gap-2">
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
          <Button
            variant="tableAction"
            size="tableAction"
            className={cn(
              "flex items-center gap-2",
              { "bg-secondary": isPanelOpen }
            )}
            onClick={onFilterClick}
            type="button"
          >
            <Filter size={14} />
            <span className="flex items-center gap-1.5">
              {t("filters")}
              {filtersCount && filtersCount > 0 ? (
                <span className="bg-white text-secondary rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold min-w-[1.2rem] text-center">
                  {filtersCount}
                </span>
              ) : null}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
