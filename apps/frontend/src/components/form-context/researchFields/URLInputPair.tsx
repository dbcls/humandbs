import { ResearchDetailSchema } from "@humandbs/backend/types";
import { z } from "zod";
import { useFieldContext } from "../FormContext";
import { Input } from "@/components/Input";

const urlSchema = z.object({
  ...ResearchDetailSchema.shape.summary.shape.url.shape.en.element.shape,
});

export type UrlItem = z.infer<typeof urlSchema>;

export function URLInputPair({
  value,
  onChange,
}: {
  value: UrlItem;
  onChange: (next: UrlItem) => void;
}) {
  return (
    <div className="flex flex-col items-stretch gap-1">
      <Input
        type="text"
        placeholder="Title"
        variant="form"
        value={value.text}
        className="rounded-b-none rounded-t-lg"
        onChange={(e) => onChange({ ...value, text: e.target.value })}
      />
      <Input
        type="text"
        placeholder="URL"
        value={value.url}
        variant="form"
        className="rounded-t-none text-xs rounded-b-lg"
        onChange={(e) => onChange({ ...value, url: e.target.value })}
      />
    </div>
  );
}

export default function URLField() {
  const field = useFieldContext<UrlItem>();

  return (
    <URLInputPair
      value={field.state.value}
      onChange={(next) => field.handleChange(next)}
    />
  );
}
