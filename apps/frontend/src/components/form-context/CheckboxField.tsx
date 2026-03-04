import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";

import { useFieldContext } from "./FormContext";

export default function CheckboxField({ label }: { label: React.ReactNode }) {
  const field = useFieldContext<boolean>();

  return (
    <Label className="cursor-pointer">
      <Checkbox
        checked={field.state.value}
        onCheckedChange={(value) => {
          field.handleChange(!!value);
        }}
      />
      {label}
    </Label>
  );
}
