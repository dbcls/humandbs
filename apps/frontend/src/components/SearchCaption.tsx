import { Search, Settings2, X } from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import { useTranslations } from "use-intl";

import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SearchCaption({
  title,
  committedQuery,
  onQueryChange,
  onFilterClick,
  isPanelOpen,
  onCopy,
  onCsv,
  onExcel,
}: {
  title: string;
  committedQuery: string;
  onQueryChange: (query: string | undefined) => void;
  onFilterClick: () => void;
  isPanelOpen: boolean;
  onCopy?: () => void;
  onCsv?: () => void;
  onExcel?: () => void;
}) {
  const t = useTranslations("common");
  const [inputValue, setInputValue] = useState(committedQuery);

  useEffect(() => {
    setInputValue(committedQuery);
  }, [committedQuery]);

  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg">{title}</h3>

      <div className="flex items-stretch gap-4">
        <div className="flex gap-1">
          <Button variant={"tableAction"} size={"tableAction"} onClick={onCopy}>
            {t("copy")}
          </Button>
          <Button variant={"tableAction"} size={"tableAction"} onClick={onCsv}>
            CSV
          </Button>
          <Button
            variant={"tableAction"}
            size={"tableAction"}
            onClick={onExcel}
          >
            Excel
          </Button>
        </div>

        <Input
          type="text"
          placeholder={t("search")}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
          }}
          beforeIcon={<Search size={22} />}
          afterIcon={
            <>
              <Button
                variant={"plain"}
                size={"icon"}
                className={"text-secondary-light pointer-events-auto"}
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

              <Button
                variant={"plain"}
                size={"icon"}
                className={cn(
                  "text-secondary-light pointer-events-auto hover:opacity-80",
                  {
                    "opacity-50": !isPanelOpen,
                  },
                )}
                onClick={onFilterClick}
              >
                <Settings2 size={22} />
              </Button>
            </>
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              startTransition(() => {
                onQueryChange(inputValue || undefined);
              });
            }
          }}
        />
      </div>
    </div>
  );
}
