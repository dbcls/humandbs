import { evaluate } from "@tanstack/react-form";
import { z } from "zod";

import { ResearchDetailSchema } from "@humandbs/backend/types";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { useFieldContext } from "../FormContext";
import { ResetFieldButton } from "../fields/ResetFieldButton";
import { getFieldDefaultValue } from "../fields/useFieldModified";

const urlSchema = z.object({
  ...ResearchDetailSchema.shape.summary.shape.url.shape.en.element.shape,
});

export type UrlItem = z.infer<typeof urlSchema>;

export function URLInputPair({
  value,
  defaultValue,
  onChange,
  onReset,
}: {
  value: UrlItem;
  defaultValue?: UrlItem | null;
  onChange: (next: UrlItem) => void;
  onReset?: () => void;
}) {
  const modified = defaultValue !== undefined && !evaluate(value, defaultValue);

  return (
    <div className="relative flex flex-col items-stretch gap-1">
      <Input
        type="text"
        placeholder="Title"
        value={value.text}
        className={cn("h-9 rounded-t-lg rounded-b-none pr-8", {
          "modified-field": modified,
        })}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
      />
      <Input
        type="text"
        placeholder="URL"
        value={value.url}
        className={cn("h-9 rounded-t-none rounded-b-lg pr-8 text-xs", {
          "modified-field": modified,
        })}
        onChange={(e) => onChange({ ...value, url: e.target.value })}
      />
      {modified && onReset && <ResetFieldButton className="-top-1" onClick={onReset} />}
    </div>
  );
}

const emptyUrl: UrlItem = { text: "", url: "" };

export default function URLField() {
  const field = useFieldContext<UrlItem | null>();
  const defaultValue = getFieldDefaultValue(field) as UrlItem | null;

  return (
    <URLInputPair
      value={field.state.value ?? emptyUrl}
      defaultValue={defaultValue}
      onChange={(next) => field.handleChange(next)}
      onReset={() => field.handleChange(defaultValue ?? null)}
    />
  );
}
