import { DateStringRange } from "@/lib/utils";
import { useFieldContext } from "./FormContext";
import { Label } from "../ui/label";
import { DateRangePicker } from "../DatePicker";

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
