import { Search, Settings2, X } from "lucide-react";
import { startTransition, useEffect, useState } from "react";

import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";

export function SearchCaption({
  title,
  committedQuery,
  onQueryChange,
  onFilterClick,
}: {
  title: string;
  committedQuery: string;
  onQueryChange: (query: string | undefined) => void;
  onFilterClick: () => void;
}) {
  const [inputValue, setInputValue] = useState(committedQuery);

  useEffect(() => {
    setInputValue(committedQuery);
  }, [committedQuery]);

  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg">{title}</h3>

      <div className="flex items-stretch gap-4">
        <div className="flex gap-1">
          <Button variant={"tableAction"} size={"tableAction"}>
            Copy
          </Button>
          <Button variant={"tableAction"} size={"tableAction"}>
            CSV
          </Button>
          <Button variant={"tableAction"} size={"tableAction"}>
            Excel
          </Button>
        </div>

        <Input
          type="text"
          placeholder="検索"
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
                className={"pointer-events-auto text-secondary-light"}
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
                className="pointer-events-auto text-secondary-light"
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
