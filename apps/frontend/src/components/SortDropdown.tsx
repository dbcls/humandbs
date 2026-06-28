import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { useTranslations } from "use-intl";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

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

  const handleSortChange = (newSort: string) => {
    onSelect({ sort: newSort, order: currentOrder });
  };

  const handleOrderToggle = () => {
    const newOrder = currentOrder === "asc" ? "desc" : "asc";
    onSelect({ sort: currentSort, order: newOrder });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-semibold text-muted-foreground select-none text-xs uppercase tracking-wider whitespace-nowrap shrink-0">
        {t("sort")}
      </span>
      <div className="flex items-center rounded-full border border-secondary-light bg-white text-xs h-11 pl-4 pr-1.5 text-secondary-light shadow-xs hover:bg-hover transition-colors">
        <Select value={currentSort} onValueChange={handleSortChange}>
          <SelectTrigger className="border-none bg-transparent shadow-none p-0 h-fit gap-1 text-xs font-semibold hover:bg-transparent focus:ring-0 focus-visible:ring-0 cursor-pointer pr-1 text-secondary-light [&_svg]:opacity-100 [&_svg]:text-secondary-light">
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
        <div className="w-px h-full bg-secondary-light mx-1.5" />
        <button
          type="button"
          className="p-1 hover:bg-secondary-light/10 active:bg-secondary-light/20 rounded-full transition-colors text-secondary-light hover:text-secondary cursor-pointer flex items-center justify-center size-8 shrink-0"
          onClick={handleOrderToggle}
          title={currentOrder === "asc" ? t("sort-asc") : t("sort-desc")}
        >
          {currentOrder === "asc" ? <ArrowUpNarrowWide size={16} /> : <ArrowDownWideNarrow size={16} />}
        </button>
      </div>
    </div>
  );
}
