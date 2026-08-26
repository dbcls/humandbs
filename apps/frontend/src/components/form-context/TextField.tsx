import { useStore } from "@tanstack/react-form";

import { cn } from "@/lib/utils";

import { LangFormLabel } from "../LangFormLabel";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useFieldContext } from "./FormContext";
import { getFieldDefaultValue, isFieldModified } from "./fields/useFieldModified";
import { ResetFieldButton } from "./ResetFieldButton";

export default function TextField({
  label,
  type = "inline",
  className,
  afterField,
  maxLength,
  modified,
  onReset,
}: {
  label?: string;
  type?: "inline" | "col";
  className?: string;
  afterField?: React.ReactNode;
  maxLength?: number;
  /** Optional caller-provided modification state for domain-specific baselines. */
  modified?: boolean;
  onReset?: () => void;
}) {
  const field = useFieldContext<string>();
  const isModified = modified ?? isFieldModified(field);

  const [isValid, errors] = useStore(field.store, (s) => [s.meta.isValid, s.meta.errors]);

  return (
    <Label
      className={cn(
        "flex-col items-stretch",
        {
          "flex-1": !label,
        },
        className,
      )}
    >
      <div
        className={cn("flex items-center gap-2", {
          "flex-col items-stretch": type === "col",
        })}
      >
        {label ? <LangFormLabel className="whitespace-nowrap">{label}</LangFormLabel> : null}
        <div className="relative flex w-full items-center gap-1">
          <Input
            value={field.state.value ?? ""}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={() => field.handleBlur()}
            maxLength={maxLength}
            className={cn("group-disabled/fieldset:disabled-text-field flex-1", {
              "modified-field": isModified,
            })}
          />
          {isModified && (
            <ResetFieldButton
              onClick={
                onReset ??
                (() => field.handleChange((getFieldDefaultValue(field) as string) ?? null))
              }
            />
          )}
        </div>
        {afterField}
      </div>
      {!isValid && (
        <em role="alert" className="inline-block space-y-1.5 text-danger text-xs">
          {errors.map((e) => {
            const msg =
              e && typeof e === "object" && "message" in e
                ? (e as { message: string }).message
                : String(e);
            return <p key={msg}>{msg}</p>;
          })}
        </em>
      )}
    </Label>
  );
}
