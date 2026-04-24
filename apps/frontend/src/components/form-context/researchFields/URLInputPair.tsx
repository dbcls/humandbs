import { ResearchDetailSchema } from "@humandbs/backend/types";
import { z } from "zod";
import { useFieldContext } from "../FormContext";
import { Input } from "@/components/ui/input";

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
        value={value.text}
        className="h-9 rounded-t-lg rounded-b-none"
        onChange={(e) => onChange({ ...value, text: e.target.value })}
      />
      <Input
        type="text"
        placeholder="URL"
        value={value.url}
        className="h-9 rounded-t-none rounded-b-lg text-xs"
        onChange={(e) => onChange({ ...value, url: e.target.value })}
      />
    </div>
  );
}

const emptyUrl: UrlItem = { text: "", url: "" };

export default function URLField() {
  const field = useFieldContext<UrlItem | null>();

  return (
    <URLInputPair
      value={field.state.value ?? emptyUrl}
      onChange={(next) => field.handleChange(next)}
    />
  );
}
