import { DateStringRange } from "@/lib/utils";

import { DateRangePicker } from "../DatePicker";
import { Label } from "../ui/label";

import { useFieldContext } from "./FormContext";

export default function DateRangeField({
  label,
  className,
}: {
  label: React.ReactNode;
  className?: string;
}) {
  const field = useFieldContext<DateStringRange>();

  return (
    <Label className={className}>
      <span>{label}</span>
      <DateRangePicker
        value={field.state.value}
        onSelect={field.handleChange}
      />
    </Label>
  );
}
