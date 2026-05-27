import { useStore } from "@tanstack/react-form";

import { cn } from "@/lib/utils";

import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useFieldContext } from "./FormContext";
import { ResetFieldButton } from "./fields/ResetFieldButton";
import { getFieldDefaultValue, isFieldModified } from "./fields/useFieldModified";

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

  const [isValid, errors] = useStore(field.store, (s) => [s.meta.isValid, s.meta.errors]);

  return (
    <Label className="flex-1 flex-col items-stretch">
      <div
        className={cn("flex items-center gap-2", className, {
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
              onClick={() => field.handleChange((getFieldDefaultValue(field) as string) ?? null)}
            />
          )}
        </div>
        {afterField}
      </div>
      {!isValid && (
        <em role="alert" className="inline-block space-y-1.5 text-danger text-xs">
          {errors.map((e, i) => {
            const msg =
              e && typeof e === "object" && "message" in e
                ? (e as { message: string }).message
                : String(e);
            return <p key={i}>{msg}</p>;
          })}
        </em>
      )}
    </Label>
  );
}
