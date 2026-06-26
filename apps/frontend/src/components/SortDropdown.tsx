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
    <div className="flex items-center rounded-full border border-neutral-300 bg-white/50 text-sm h-11 pl-4 pr-1.5 text-foreground shadow-xs hover:bg-white transition-colors">
      <span className="font-semibold text-muted-foreground select-none text-xs mr-2 pr-2 border-r border-neutral-200 uppercase tracking-wider">
        {t("sort")}
      </span>
      <Select value={currentSort} onValueChange={handleSortChange}>
        <SelectTrigger className="border-none bg-transparent shadow-none p-0 h-fit gap-1 text-sm font-medium hover:bg-transparent focus:ring-0 focus-visible:ring-0 cursor-pointer pr-1">
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
      <div className="w-px h-3.5 bg-neutral-200 mx-1.5" />
      <button
        type="button"
        className="p-1 hover:bg-neutral-100 active:bg-neutral-200 rounded-full transition-colors text-muted-foreground hover:text-foreground cursor-pointer flex items-center justify-center size-8 shrink-0"
        onClick={handleOrderToggle}
        title={currentOrder === "asc" ? t("sort-asc") : t("sort-desc")}
      >
        {currentOrder === "asc" ? <ArrowUpNarrowWide size={16} /> : <ArrowDownWideNarrow size={16} />}
      </button>
    </div>
  );
}
