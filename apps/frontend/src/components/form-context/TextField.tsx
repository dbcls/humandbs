import { cn } from "@/lib/utils";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useFieldContext } from "./FormContext";

export default function TextField({
  label,
  type = "inline",
  className,
}: {
  label?: string;
  type?: "inline" | "col";
  className?: string;
}) {
  const field = useFieldContext<string>();

  return (
    <Label
      className={cn(className, { "flex flex-col items-start": type === "col" })}
    >
      {label ? <span className="whitespace-nowrap">{label}</span> : null}
      <Input
        value={field.state.value ?? ""}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={() => field.handleBlur()}
      />
    </Label>
  );
}
