import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DateStringRange,
  toDate,
  toDateRange,
  toDateString,
  toDateStringRange,
} from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { DateRange } from "react-day-picker";

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
}: {
  // label: string;
  value: DateStringRange | undefined;
  onSelect: (value: DateStringRange) => void;
}) {
  const [open, setOpen] = useState(false);

  const [dateRange, setDateRange] = useState<DateStringRange | undefined>(
    value
  );

  useEffect(() => {
    setDateRange(value);
  }, [value]);

  const handleSelect = (
    nextRange: DateRange | undefined,
    selectedDay: Date | undefined
  ) => {
    const newRange =
      dateRange?.from && dateRange?.to
        ? { from: selectedDay }
        : (nextRange as DateRange);

    setDateRange(toDateStringRange(newRange));

    if (
      (newRange?.from && newRange?.to) ||
      (!newRange?.from && !newRange?.to)
    ) {
      const dateStringRange = toDateStringRange(newRange);
      dateStringRange && onSelect(dateStringRange);
    }
  };

  return (
    // <Label className="flex w-fit flex-col items-start gap-2">
    //   <span>{label ?? "Date"}</span>

    <Popover open={open} onOpenChange={setOpen}>
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
          selected={toDateRange(dateRange)}
          defaultMonth={toDateRange(dateRange)?.from}
          captionLayout="dropdown"
          onSelect={handleSelect}
        />
      </PopoverContent>
    </Popover>
    // </Label>
  );
}
