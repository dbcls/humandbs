import { Label } from "../ui/label";
import { useFieldContext } from "./FormContext";
import { TextareaAutosize } from "../ui/textarea";

export default function TextAreaField({ label }: { label: string }) {
  const field = useFieldContext<string>();

  return (
    <Label className="flex flex-col items-start gap-2">
      <span>{label}</span>
      <TextareaAutosize
        minRows={2}
        className="resize-none"
        value={field.state.value ?? ""}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={() => field.handleBlur()}
      />
    </Label>
  );
}
