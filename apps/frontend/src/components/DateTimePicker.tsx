import { ChevronDownIcon } from "lucide-react";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function toTimeString(date: Date): string {
  const h = `${date.getUTCHours()}`.padStart(2, "0");
  const m = `${date.getUTCMinutes()}`.padStart(2, "0");
  return `${h}:${m}`;
}

function formatDisplay(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getUTCDate()}`.padStart(2, "0");
  const h = `${date.getUTCHours()}`.padStart(2, "0");
  const min = `${date.getUTCMinutes()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${h}:${min}`;
}

function calendarSelected(date: Date): Date {
  // react-day-picker works in local time; shift UTC date into local so the calendar
  // highlights the correct day regardless of timezone.
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function mergeDateTime(calendarDay: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  return new Date(
    Date.UTC(calendarDay.getFullYear(), calendarDay.getMonth(), calendarDay.getDate(), h ?? 0, m ?? 0),
  );
}

export function DateTimePicker({
  value,
  onChange,
}: {
  value: Date | null | undefined;
  onChange: (date: Date | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [timeStr, setTimeStr] = useState<string>(() =>
    value ? toTimeString(value) : "00:00",
  );

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const next = mergeDateTime(day, timeStr);
    onChange(next);
    setOpen(false);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = e.target.value;
    setTimeStr(t);
    if (value) {
      const local = calendarSelected(value);
      onChange(mergeDateTime(local, t));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size={"slim"} className="font-normal">
          {value ? formatDisplay(value) : "Select date & time"}
          <ChevronDownIcon className="inline-block size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden bg-white p-0" align="start">
        <Calendar
          required={false}
          mode="single"
          selected={value ? calendarSelected(value) : undefined}
          captionLayout="dropdown"
          onSelect={handleDaySelect}
        />
        <div className="border-t p-3">
          <Input
            type="time"
            value={timeStr}
            onChange={handleTimeChange}
            className="w-full"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
