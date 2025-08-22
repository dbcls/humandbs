import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { DateRange } from "react-day-picker";
import { useLocale } from "use-intl";

export function DatePicker({
  dateValue,
  onChangeDateValue,
  label,
}: {
  dateValue?: Date;
  onChangeDateValue: (date: Date | undefined) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Label className="flex flex-col items-start gap-2">
      <span>{label ?? "Date"}</span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size={"slim"} className="font-normal">
            {dateValue ? dateValue.toLocaleDateString() : "Select date"}
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
            selected={dateValue}
            captionLayout="dropdown"
            onSelect={(date) => {
              onChangeDateValue(date);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </Label>
  );
}

export function DateRangePicker({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: DateRange | undefined;
  onSelect: (value: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(value);

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

    setDateRange(newRange);

    if (
      (newRange?.from && newRange?.to) ||
      (!newRange?.from && !newRange?.to)
    ) {
      onSelect(newRange);
    }
  };

  const locale = useLocale();

  return (
    <Label className="flex w-fit flex-col items-start gap-2">
      <span>{label ?? "Date"}</span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size={"slim"} className="font-normal">
            {value
              ? `${value.from?.toLocaleDateString(locale, { timeZone: "UTC" })} - ${value.to?.toLocaleDateString(locale, { timeZone: "UTC" })}`
              : "Select date range"}
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
            selected={dateRange}
            defaultMonth={dateRange?.from}
            captionLayout="dropdown"
            onSelect={handleSelect}
          />
        </PopoverContent>
      </Popover>
    </Label>
  );
}
