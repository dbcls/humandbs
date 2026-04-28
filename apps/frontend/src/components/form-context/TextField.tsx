import { cn } from "@/lib/utils";

import { Input } from "../ui/input";
import { Label } from "../ui/label";

import { ResetFieldButton } from "./fields/ResetFieldButton";
import {
  getFieldDefaultValue,
  isFieldModified,
} from "./fields/useFieldModified";
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
  const isModified = isFieldModified(field);

  return (
    <Label
      className={cn("flex items-center", className, {
        "flex-col items-stretch": type === "col",
      })}
    >
      {label ? <span className="whitespace-nowrap">{label}</span> : null}
      <div className="relative flex w-full items-center gap-1">
        <Input
          value={field.state.value ?? ""}
          onChange={(e) => field.handleChange(e.target.value)}
          onBlur={() => field.handleBlur()}
          className={isModified ? "modified-field" : undefined}
        />
        {isModified && (
          <ResetFieldButton
            onClick={() =>
              field.handleChange(
                (getFieldDefaultValue(field) as string) ?? null,
              )
            }
          />
        )}
        {afterField}
      </div>
    </Label>
  );
}
