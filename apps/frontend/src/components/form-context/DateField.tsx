import { DatePicker } from "../DatePicker";
import { Label } from "../ui/label";
import { useFieldContext } from "./FormContext";

export default function DateField({ label }: { label: React.ReactNode }) {
  const field = useFieldContext<string>();

  return (
    <Label className="flex w-fit flex-col items-start gap-2">
      <span>{label ?? "Date"}</span>
      <DatePicker
        dateValue={field.state.value}
        onChangeDateValue={(value) => value && field.setValue(value)}
      />
    </Label>
  );
}
