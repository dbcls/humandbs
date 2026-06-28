import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";

import { cn } from "@/lib/utils";
import { buttonVariants } from "./ui/button";

interface SortOption {
  label: string;
  value: string;
}

export function SortDropdown({
  onSelect,
  options,
  sort,
  order,
}: {
  onSelect: (x: { sort: string; order: "asc" | "desc" }) => void;
  options: SortOption[];
  sort: string | undefined;
  order: "asc" | "desc" | undefined;
}) {
  const t = useTranslations("common");
  const currentSort = sort || "";
  const currentOrder = order || "asc";
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeOption = options.find((o) => o.value === currentSort);

  const handleSortChange = (newSort: string) => {
    onSelect({ sort: newSort, order: currentOrder });
    setIsOpen(false);
  };

  const handleOrderToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newOrder = currentOrder === "asc" ? "desc" : "asc";
    onSelect({ sort: currentSort, order: newOrder });
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <span className="font-semibold text-secondary-light select-none text-xs uppercase tracking-wider whitespace-nowrap shrink-0">
        {t("sort")}
      </span>
      <div className="relative" ref={containerRef}>
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            buttonVariants({ variant: "tableAction", size: "tableAction" }),
            "cursor-pointer h-11 pl-4 pr-2.5 font-normal select-none transition-colors",
            isOpen
              ? "border-secondary text-secondary-light bg-white"
              : "hover:text-secondary-light hover:bg-hover",
          )}
        >
          <div className="flex items-center gap-1 text-xs font-semibold pr-1">
            <span>{activeOption ? activeOption.label : ""}</span>
            <svg className="size-3.5 fill-current shrink-0" viewBox="0 0 24 24">
              <path d="M12 16l-6-6h12z" />
            </svg>
          </div>

          <div className="w-px h-full mx-1.5 bg-secondary-light" />

          <button
            type="button"
            className={cn(
              "p-1 rounded-full transition-colors cursor-pointer flex items-center justify-center size-8 shrink-0",
              isOpen
                ? "bg-secondary text-white hover:bg-secondary/90"
                : "text-secondary-light hover:text-secondary hover:bg-secondary-light/10 active:bg-secondary-light/20",
            )}
            onClick={handleOrderToggle}
            title={currentOrder === "asc" ? t("sort-asc") : t("sort-desc")}
          >
            {currentOrder === "asc" ? <ArrowUpNarrowWide size={16} /> : <ArrowDownWideNarrow size={16} />}
          </button>
        </div>

        {isOpen && (
          <div className="absolute left-0 z-50 mt-1.5 w-full rounded-xl border border-secondary-light bg-white py-1.5 shadow-lg text-sm font-semibold text-secondary-light animate-in fade-in-0 slide-in-from-top-1 duration-100">
            {options.map(({ label, value }) => {
              const isSelected = value === currentSort;
              return (
                <div
                  key={value}
                  onClick={() => handleSortChange(value)}
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center justify-between py-2 px-5 hover:bg-hover hover:text-secondary transition-colors first:rounded-t-xl last:rounded-b-xl",
                    isSelected && "text-secondary font-bold",
                  )}
                >
                  <span>{label}</span>
                  {isSelected && <span className="text-[10px]">✓</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
