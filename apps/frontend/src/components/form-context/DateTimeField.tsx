import { DateTimePicker } from "../DateTimePicker";
import { Label } from "../ui/label";
import { useFieldContext } from "./FormContext";

export default function DateTimeField({ label }: { label: React.ReactNode }) {
  const field = useFieldContext<Date | null>();

  return (
    <Label className="flex w-fit flex-col items-start gap-2">
      <span>{label ?? "Date & time"}</span>
      <DateTimePicker value={field.state.value} onChange={(value) => field.setValue(value)} />
    </Label>
  );
}
