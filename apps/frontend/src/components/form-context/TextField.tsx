import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useFieldContext } from "./FormContext";

export default function TextField({ label }: { label: string }) {
  const field = useFieldContext<string>();

  return (
    <Label>
      <span>{label}</span>
      <Input
        value={field.state.value ?? ""}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={() => field.handleBlur()}
      />
    </Label>
  );
}
