import { Filter, Search, X } from "lucide-react";
import { useTranslations } from "use-intl";

import { startTransition, useEffect, useState } from "react";

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
  filterButtonRef,
  sortControl,
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
  filterButtonRef?: React.Ref<HTMLButtonElement>;
  sortControl?: React.ReactNode;
}) {
  const t = useTranslations("common");
  const [inputValue, setInputValue] = useState<string>(committedQuery);

  useEffect(() => {
    setInputValue(committedQuery);
  }, [committedQuery]);

  function handleResetInput() {
    setInputValue("");
    if (committedQuery.trim().length > 0) {
      startTransition(() => {
        onQueryChange(undefined);
      });
    }
  }

  function handleSearch() {
    startTransition(() => {
      onQueryChange(inputValue || undefined);
    });
  }

  return (
    <div className="flex h-fit flex-wrap items-center justify-between">
      <div className="flex items-baseline gap-5">
        <h3 className="relative pl-3 text-lg before:absolute before:-left-6 before:h-full before:w-2 before:bg-secondary">
          {title}
        </h3>
        {resultsCount}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {sortControl}
        <div className="flex gap-1">
          <Button variant={"tableAction"} size={"tableAction"} onClick={onCopy}>
            {t("copy")}
          </Button>
          <Button variant={"tableAction"} size={"tableAction"} onClick={onCsv}>
            CSV
          </Button>
          <Button variant={"tableAction"} size={"tableAction"} onClick={onExcel}>
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
            className="h-11 w-md py-2 pr-0 pl-6 text-xs"
            afterIcon={
              <>
                {inputValue ? (
                  <Button
                    variant={"plain"}
                    size={"icon"}
                    className={"pointer-events-auto text-foreground-light"}
                    onClick={handleResetInput}
                  >
                    <X size={18} />
                  </Button>
                ) : null}
                <Button
                  disabled={inputValue.trim().length === 0}
                  variant="accent"
                  size="default"
                  className="pointer-events-auto gap-2 rounded-full px-4 h-8 text-xs"
                  onClick={handleSearch}
                >
                  <Search size={14} />
                </Button>
              </>
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
          />
          <Button
            ref={filterButtonRef}
            variant="tableAction"
            size="tableAction"
            className={cn("flex items-center gap-2", {
              "bg-secondary": isPanelOpen,
            })}
            onClick={onFilterClick}
            type="button"
          >
            <Filter size={14} />
            <span className="flex items-center gap-1.5">
              {t("filters")}
              {filtersCount && filtersCount > 0 ? (
                <span className="min-w-[1.2rem] rounded-full bg-white px-1.5 py-0.5 text-center font-bold text-[10px] text-secondary leading-none">
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


