import { cn } from "@/lib/utils";

import { Input } from "../ui/input";
import { Label } from "../ui/label";

import { useFieldContext } from "./FormContext";

export default function TextField({
  label,
  type = "inline",
  className,
  afterField,
}: {
  label?: string;
  type?: "inline" | "col";
  className?: string;
  afterField?: React.ReactNode;
}) {
  const field = useFieldContext<string>();

  return (
    <Label
      className={cn("flex items-center", className, {
        "flex-col items-stretch": type === "col",
      })}
    >
      {label ? <span className="whitespace-nowrap">{label}</span> : null}
      <div className="flex w-full items-center gap-1">
        <Input
          value={field.state.value ?? ""}
          onChange={(e) => field.handleChange(e.target.value)}
          onBlur={() => field.handleBlur()}
        />
        {afterField}
      </div>
    </Label>
  );
}
