import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ResearchDetailSchema } from "@humandbs/backend/types";
import { z } from "zod";

import { useFieldContext } from "../FormContext";
import { getFieldDefaultValue } from "../fields/useFieldModified";
import { URLInputPair, type UrlItem } from "./URLInputPair";

const urlArraySchema = ResearchDetailSchema.shape.summary.shape.url;

type BilingualURLArray = z.infer<typeof urlArraySchema>;

export default function BilingualURLArrayField({
  label,
}: {
  label?: React.ReactNode;
}) {
  const field = useFieldContext<BilingualURLArray>();
  const enItems = field.state.value?.en ?? [];
  const defaultValue = getFieldDefaultValue(field) as BilingualURLArray | undefined;

  function updateItem(
    lang: "en" | "ja",
    i: number,
    next: { text: string; url: string },
  ) {
    field.handleChange((prev) => {
      const copy = [...prev[lang]];
      copy[i] = next;
      return { ...prev, [lang]: copy };
    });
  }

  function resetItem(lang: "en" | "ja", i: number) {
    const def = defaultValue?.[lang]?.[i] ?? null;
    field.handleChange((prev) => {
      const copy = [...prev[lang]];
      copy[i] = def ?? { text: "", url: "" };
      return { ...prev, [lang]: copy };
    });
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <Label>{label}</Label>

      {enItems.length > 0 && (
        <div className="flex gap-2">
          <div className="flex-1 text-xs font-medium text-gray-500 uppercase">
            En
          </div>
          <div className="flex-1 text-xs font-medium text-gray-500 uppercase">
            Ja
          </div>
          <div className="w-8" />
        </div>
      )}

      {enItems.map((_, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1">
            <URLInputPair
              value={field.state.value?.en[i] ?? { text: "", url: "" }}
              defaultValue={defaultValue?.en?.[i] as UrlItem | undefined}
              onChange={(next) => updateItem("en", i, next)}
              onReset={defaultValue?.en?.[i] !== undefined ? () => resetItem("en", i) : undefined}
            />
          </div>
          <div className="flex-1">
            <URLInputPair
              value={field.state.value?.ja[i] ?? { text: "", url: "" }}
              defaultValue={defaultValue?.ja?.[i] as UrlItem | undefined}
              onChange={(next) => updateItem("ja", i, next)}
              onReset={defaultValue?.ja?.[i] !== undefined ? () => resetItem("ja", i) : undefined}
            />
          </div>
          <button
            type="button"
            className="mt-1"
            onClick={() =>
              field.handleChange((prev) => ({
                en: prev.en.filter((_, idx) => idx !== i),
                ja: prev.ja.filter((_, idx) => idx !== i),
              }))
            }
          >
            <Trash2 className="text-danger size-4" />
          </button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed"
        onClick={() =>
          field.handleChange((prev) => ({
            en: [...(prev?.en ?? []), { text: "", url: "" }],
            ja: [...(prev?.ja ?? []), { text: "", url: "" }],
          }))
        }
      >
        + Add
      </Button>
    </fieldset>
  );
}
