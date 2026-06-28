import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "use-intl";

import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
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

  const handleSortChange = (newSort: string) => {
    onSelect({ sort: newSort, order: currentOrder });
  };

  const handleOrderToggle = () => {
    const newOrder = currentOrder === "asc" ? "desc" : "asc";
    onSelect({ sort: currentSort, order: newOrder });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-semibold text-secondary-light select-none text-xs uppercase tracking-wider whitespace-nowrap shrink-0">
        {t("sort")}
      </span>
      <div
        className={cn(
          buttonVariants({ variant: "tableAction", size: "tableAction" }),
          "cursor-default h-11 pl-4 pr-2.5 font-normal",
          isOpen
            ? "border-secondary bg-secondary text-white hover:bg-secondary hover:text-white"
            : "hover:text-secondary-light hover:bg-hover",
        )}
      >
        <Select value={currentSort} onValueChange={handleSortChange} onOpenChange={setIsOpen}>
          <SelectTrigger
            className={cn(
              "border-none bg-transparent shadow-none p-0 h-fit gap-1 text-xs font-semibold hover:bg-transparent focus:ring-0 focus-visible:ring-0 cursor-pointer pr-1 text-secondary-light transition-colors",
              isOpen ? "text-white [&_svg]:text-white" : "text-secondary-light [&_svg]:text-secondary-light",
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(({ label, value }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className={cn("w-px h-full mx-1.5 transition-colors", isOpen ? "bg-white" : "bg-secondary-light")} />
        <button
          type="button"
          className={cn(
            "p-1 rounded-full transition-colors cursor-pointer flex items-center justify-center size-8 shrink-0",
            isOpen
              ? "text-white hover:text-white/80 hover:bg-white/10 active:bg-white/20"
              : "text-secondary-light hover:text-secondary hover:bg-secondary-light/10 active:bg-secondary-light/20",
          )}
          onClick={handleOrderToggle}
          title={currentOrder === "asc" ? t("sort-asc") : t("sort-desc")}
        >
          {currentOrder === "asc" ? <ArrowUpNarrowWide size={16} /> : <ArrowDownWideNarrow size={16} />}
        </button>
      </div>
    </div>
  );
}
