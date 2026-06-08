import { LucideArrowDownRight, LucideArrowUpRight } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface SortOption {
  label: string;
  value: string;
  order: "asc" | "desc";
}

export function SortDropdown({
  onSelect,
  options,
  value,
}: {
  onSelect: (x: { sort: string; order: "asc" | "desc" }) => void;
  options: SortOption[];
  value: string | undefined;
}) {
  const currentOrder = value ? (value.split(":")[1] as "asc" | "desc") : "asc";

  const currentLabel = options.find((option) => option.value === value)?.label ?? "Sort";

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const [sort, order] = v.split(":");
        onSelect({ sort, order: order as "asc" | "desc" });
      }}
    >
      <SelectTrigger size="sm" className="h-10 w-auto gap-2 rounded-full text-sm">
        <SelectValue>
          <OrderIcon order={currentOrder} />
          {currentLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map(({ label, value, order }) => (
          <SelectItem key={`${value}:${order}`} value={`${value}:${order}`}>
            <OrderIcon order={order} />

            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OrderIcon({ order }: { order: "asc" | "desc" }) {
  return order === "asc" ? <LucideArrowUpRight /> : <LucideArrowDownRight />;
}
