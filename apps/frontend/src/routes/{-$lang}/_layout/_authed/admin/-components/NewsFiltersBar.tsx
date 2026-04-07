import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { XIcon } from "lucide-react";

import { DateRangePicker } from "@/components/DatePicker";
import { FilterSearchInput } from "@/components/FilterSearchInput";
import { TagPill } from "@/components/TagPill";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFilters } from "@/hooks/useFilters";
import { getTagsQueryOptions } from "@/serverFunctions/news";
import type { DateStringRange } from "@/utils/dates";
import type { NewsAdminSearchParams } from "@/utils/queryParams";

const routeApi = getRouteApi("/{-$lang}/_layout/_authed/admin/news");

export function NewsFiltersBar() {
  const search = routeApi.useSearch();
  const { setFilters } = useFilters(routeApi.id);

  const hasActiveFilters = !!(
    search.q ||
    search.publishedFrom ||
    search.publishedTo ||
    search.isAlert ||
    (search.tagIds && search.tagIds.length > 0)
  );

  function handleClearAll() {
    setFilters({
      q: undefined,
      publishedFrom: undefined,
      publishedTo: undefined,
      isAlert: undefined,
      tagIds: undefined,
    });
  }

  return (
    <div className="mb-3 flex flex-col gap-2">
      <TextSearchFilter value={search.q} onChange={(q) => setFilters({ q })} />
      <DateRangeFilter
        from={search.publishedFrom}
        to={search.publishedTo}
        onChange={({ publishedFrom, publishedTo }) =>
          setFilters({ publishedFrom, publishedTo })
        }
      />
      <AlertToggleFilter
        value={search.isAlert}
        onChange={(isAlert) => setFilters({ isAlert })}
      />
      <TagFilter
        value={search.tagIds ?? []}
        onChange={(tagIds) =>
          setFilters({ tagIds: tagIds.length > 0 ? tagIds : undefined })
        }
      />
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="slim"
          className="self-start text-xs text-muted-foreground"
          onClick={handleClearAll}
        >
          <XIcon className="mr-1 size-3" />
          Clear filters
        </Button>
      )}
    </div>
  );
}

function TextSearchFilter({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (q: string | undefined) => void;
}) {
  return (
    <FilterSearchInput
      value={value}
      onChange={onChange}
      placeholder="Search by title or content…"
    />
  );
}

function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string | undefined;
  to: string | undefined;
  onChange: (range: { publishedFrom?: string; publishedTo?: string }) => void;
}) {
  const value: DateStringRange | undefined =
    from || to ? { from, to } : undefined;

  return (
    <DateRangePicker
      value={value}
      onSelect={(range) =>
        onChange({ publishedFrom: range.from, publishedTo: range.to })
      }
      onClear={() => onChange({ publishedFrom: undefined, publishedTo: undefined })}
    />
  );
}

function AlertToggleFilter({
  value,
  onChange,
}: {
  value: NewsAdminSearchParams["isAlert"];
  onChange: (val: NewsAdminSearchParams["isAlert"]) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value ?? "all"}
      onValueChange={(val) => {
        if (val === "all" || !val) onChange(undefined);
        else onChange(val as "alert" | "news");
      }}
    >
      <ToggleGroupItem value="all">All</ToggleGroupItem>
      <ToggleGroupItem value="alert">Alert</ToggleGroupItem>
      <ToggleGroupItem value="news">News</ToggleGroupItem>
    </ToggleGroup>
  );
}

function TagFilter({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tagIds: string[]) => void;
}) {
  const { data: allTags = [] } = useQuery(getTagsQueryOptions());
  const anchor = useComboboxAnchor();

  return (
    <Combobox
      multiple
      value={value}
      onValueChange={onChange}
    >
      <ComboboxChips ref={anchor} className="min-h-8 text-sm">
        {value.map((id) => {
          const tag = allTags.find((t) => t.id === id);
          if (!tag) return null;
          return (
            <ComboboxChip key={id} color={tag.color}>
              {tag.name}
            </ComboboxChip>
          );
        })}
        <ComboboxChipsInput placeholder={value.length === 0 ? "Filter by tag…" : ""} />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxList>
          {allTags.length === 0 ? (
            <div className="py-2 text-center text-sm text-muted-foreground">
              No tags found
            </div>
          ) : (
            allTags.map((tag) => (
              <ComboboxItem key={tag.id} value={tag.id}>
                <TagPill color={tag.color}>{tag.name}</TagPill>
              </ComboboxItem>
            ))
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
