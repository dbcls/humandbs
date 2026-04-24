import { ChevronDownIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type DateStringRange,
  toDate,
  toDateRange,
  toDateString,
  toDateStringRange,
} from "@/utils/dates";

export function DatePicker({
  dateValue,
  onChangeDateValue,
}: {
  dateValue?: string | null;
  onChangeDateValue: (date: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size={"slim"} className="font-normal">
          {dateValue ?? "Select date"}
          <ChevronDownIcon className="inline-block size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto overflow-hidden bg-white p-0"
        align="start"
      >
        <Calendar
          required={false}
          mode="single"
          selected={toDate(dateValue)}
          captionLayout="dropdown"
          onSelect={(date) => {
            onChangeDateValue(toDateString(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
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
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(
    toDateRange(value),
  );

  // Seed/reset draft from the committed value on every open/close.
  const handleOpenChange = (next: boolean) => {
    setDraftRange(toDateRange(value));
    setOpen(next);
  };

  const handleSelect = (
    nextRange: DateRange | undefined,
    selectedDay: Date,
  ) => {
    // If a complete (non-trivial) range already exists, the user is starting a new selection.
    const hasCompleteRange =
      draftRange?.from &&
      draftRange?.to &&
      draftRange.from.getTime() !== draftRange.to.getTime();

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
        <PopoverContent
          className="w-auto overflow-hidden bg-white p-0"
          align="start"
        >
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
          className="text-muted-foreground hover:text-foreground size-7"
          onClick={onClear}
        >
          <XIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}
