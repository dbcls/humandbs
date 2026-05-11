import { getRouteApi } from "@tanstack/react-router";
import { XIcon } from "lucide-react";

import { DateRangePicker } from "@/components/DatePicker";
import { FilterSearchInput } from "@/components/FilterSearchInput";
import { Button } from "@/components/ui/button";
import { useFilters } from "@/hooks/useFilters";
import type { DateStringRange } from "@/utils/dates";

const routeApi = getRouteApi("/{-$lang}/_layout/_authed/admin/alerts");

export function AlertsFiltersBar() {
  const search = routeApi.useSearch();
  const { setFilters } = useFilters("/{-$lang}/_layout/_authed/admin/alerts");

  const hasActiveFilters = !!(search.q || search.activeFrom || search.activeTo);

  function handleClearAll() {
    setFilters({
      q: undefined,
      activeFrom: undefined,
      activeTo: undefined,
    });
  }

  return (
    <div className="mb-3 flex flex-col gap-2">
      <FilterSearchInput
        value={search.q}
        onChange={(q) => setFilters({ q })}
        placeholder="Search by content…"
      />
      <DateRangeFilter
        from={search.activeFrom}
        to={search.activeTo}
        onChange={({ activeFrom, activeTo }) =>
          setFilters({ activeFrom, activeTo })
        }
      />
      {hasActiveFilters ? (
        <Button
          variant="ghost"
          size="slim"
          className="text-muted-foreground self-start text-xs"
          onClick={handleClearAll}
        >
          <XIcon className="mr-1 size-3" />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string | undefined;
  to: string | undefined;
  onChange: (range: { activeFrom?: string; activeTo?: string }) => void;
}) {
  const value: DateStringRange | undefined =
    from || to ? { from, to } : undefined;

  return (
    <DateRangePicker
      value={value}
      onSelect={(range) =>
        onChange({ activeFrom: range.from, activeTo: range.to })
      }
      onClear={() => onChange({ activeFrom: undefined, activeTo: undefined })}
    />
  );
}
