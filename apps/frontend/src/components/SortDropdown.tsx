import { ArrowDown, ArrowUp } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Button } from "./ui/button";

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
    <div className="flex items-center gap-1.5">
      <Select value={currentSort} onValueChange={handleSortChange}>
        <SelectTrigger className="h-fit py-2 px-5 gap-2 rounded-full border border-neutral-300 text-sm font-semibold bg-white/50 hover:bg-white text-foreground shadow-xs">
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
      <Button
        variant="tableAction"
        className="h-fit px-3 py-2 rounded-full"
        onClick={handleOrderToggle}
        title={currentOrder === "asc" ? "Ascending" : "Descending"}
      >
        {currentOrder === "asc" ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
      </Button>
    </div>
  );
}
