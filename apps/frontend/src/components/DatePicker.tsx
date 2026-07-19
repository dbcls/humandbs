import { ChevronDownIcon, XIcon } from "lucide-react";

import { useState } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateStringRange } from "@/utils/dates";
import {
  toDate,
  toDateRange,
  toDateString,
  toDateStringRange,
  toLocaleDateTimeString,
} from "@/utils/dates";

export function DatePicker({
  dateValue,
  onChangeDateValue,
}: {
  dateValue?: string | null;
  onChangeDateValue: (date: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  const thisYear = new Date().getFullYear();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size={"slim"} className="font-normal">
          {dateValue ?? "Select date"}
          <ChevronDownIcon className="inline-block size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden bg-white p-0" align="start">
        <Calendar
          required={false}
          mode="single"
          selected={toDate(dateValue)}
          captionLayout="dropdown"
          endMonth={new Date(thisYear + 10, 0)}
          onSelect={(date) => {
            onChangeDateValue(toDateString(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// Converts a date-only calendar day (local midnight) to a UTC ISO string with the given time.
function localDayToUtcIso(day: Date, hours: number, minutes: number): string {
  return new Date(
    Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes),
  ).toISOString();
}

// Parse an ISO datetime string back to a local-midnight Date for the calendar.
function isoToCalendarDay(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function DateTimeRangePicker({
  value,
  onSelect,
  onClear,
}: {
  value: DateStringRange | undefined;
  onSelect: (value: DateStringRange) => void;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const fromDay = isoToCalendarDay(value?.from);
  const toDay = isoToCalendarDay(value?.to);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(
    fromDay ? { from: fromDay, to: toDay } : undefined,
  );

  const handleOpenChange = (next: boolean) => {
    const f = isoToCalendarDay(value?.from);
    const t = isoToCalendarDay(value?.to);
    setDraftRange(f ? { from: f, to: t } : undefined);
    setOpen(next);
  };

  const handleSelect = (nextRange: DateRange | undefined, selectedDay: Date) => {
    const hasCompleteRange =
      draftRange?.from && draftRange?.to && draftRange.from.getTime() !== draftRange.to.getTime();

    const incoming: DateRange = hasCompleteRange
      ? { from: selectedDay, to: undefined }
      : (nextRange ?? { from: selectedDay, to: undefined });

    setDraftRange(incoming);

    const { from, to } = incoming;
    if (from && to && from.getTime() !== to.getTime()) {
      onSelect({
        from: localDayToUtcIso(from, 0, 0),
        to: localDayToUtcIso(to, 23, 59),
      });
      setOpen(false);
    }
  };

  const displayLabel = value?.from
    ? `${toLocaleDateTimeString(value.from)} – ${toLocaleDateTimeString(value.to)}`
    : "Select date range";

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="outline" size={"slim"} className="font-normal">
            {displayLabel}
            <ChevronDownIcon className="inline-block size-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden bg-white p-0" align="start">
          <Calendar
            numberOfMonths={2}
            mode="range"
            selected={draftRange}
            defaultMonth={draftRange?.from}
            captionLayout="dropdown"
            onSelect={handleSelect}
          />
        </PopoverContent>
      </Popover>
      {onClear && value && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={onClear}
        >
          <XIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}

export function DateRangePicker({
  // label,
  value,
  onSelect,
  onClear,
}: {
  // label: string;
  value: DateStringRange | undefined;
  onSelect: (value: DateStringRange) => void;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);

  // In-progress local selection, independent of the committed value prop.
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(toDateRange(value));

  // Seed/reset draft from the committed value on every open/close.
  const handleOpenChange = (next: boolean) => {
    setDraftRange(toDateRange(value));
    setOpen(next);
  };

  const handleSelect = (nextRange: DateRange | undefined, selectedDay: Date) => {
    // If a complete (non-trivial) range already exists, the user is starting a new selection.
    const hasCompleteRange =
      draftRange?.from && draftRange?.to && draftRange.from.getTime() !== draftRange.to.getTime();

    const incoming: DateRange = hasCompleteRange
      ? { from: selectedDay, to: undefined }
      : (nextRange ?? { from: selectedDay, to: undefined });

    setDraftRange(incoming);

    const { from, to } = incoming;
    if (from && to && from.getTime() !== to.getTime()) {
      onSelect(toDateStringRange({ from, to })!);
      setOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="outline" size={"slim"} className="font-normal">
            {value ? `${value.from} - ${value.to}` : "Select date range"}
            <ChevronDownIcon className="inline-block size-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden bg-white p-0" align="start">
          <Calendar
            numberOfMonths={2}
            mode="range"
            selected={draftRange}
            defaultMonth={draftRange?.from}
            captionLayout="dropdown"
            onSelect={handleSelect}
          />
        </PopoverContent>
      </Popover>
      {onClear && value && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={onClear}
        >
          <XIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}
