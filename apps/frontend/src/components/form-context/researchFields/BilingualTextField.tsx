import { useFieldContext } from "@/components/form-context/FormContext";
import { deepEqual, getFieldDefaultValue } from "@/components/form-context/fields/useFieldModified";
import { Input } from "@/components/Input";
import { TextareaAutosize } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ResearchDetailSchema } from "@humandbs/backend/types";
import { z } from "zod";

const BilingualTextSchema = ResearchDetailSchema.pick({ title: true });

type BilingualText = z.infer<typeof BilingualTextSchema>["title"];

export default function BilingualTextField({
  label,
  variant = "text",
}: {
  label?: React.ReactNode;
  variant?: "text" | "textarea";
}) {
  const field = useFieldContext<BilingualText>();
  const initial = getFieldDefaultValue(field) as BilingualText | undefined;
  const isEnModified = !deepEqual(field.state.value.en, initial?.en);
  const isJaModified = !deepEqual(field.state.value.ja, initial?.ja);

  return (
    <Label className="flex w-full flex-col items-stretch gap-2">
      <span>{label ?? "Text"}</span>
      <div className="flex w-full gap-2">
        {variant === "textarea" ? (
          <TextareaAutosize
            minRows={2}
            className={`flex-1 resize-none rounded-lg px-3 py-2 text-sm ${isEnModified ? "bg-yellow-50" : "bg-primary"}`}
            value={field.state.value.en ?? ""}
            onChange={(e) =>
              field.handleChange((prev) => ({ ...prev, en: e.target.value }))
            }
            placeholder="En"
          />
        ) : (
          <Input
            type="text"
            variant="form"
            className={`flex-1 ${isEnModified ? "bg-yellow-50" : ""}`}
            value={field.state.value.en ?? ""}
            onChange={(e) =>
              field.handleChange((prev) => ({ ...prev, en: e.target.value }))
            }
            placeholder="En"
          />
        )}
        {variant === "textarea" ? (
          <TextareaAutosize
            minRows={2}
            className={`flex-1 resize-none rounded-lg px-3 py-2 text-sm ${isJaModified ? "bg-yellow-50" : "bg-primary"}`}
            value={field.state.value.ja ?? ""}
            onChange={(e) =>
              field.setValue((prev) => ({ ...prev, ja: e.target.value }))
            }
            placeholder="Ja"
          />
        ) : (
          <Input
            type="text"
            variant="form"
            className={`flex-1 ${isJaModified ? "bg-yellow-50" : ""}`}
            value={field.state.value.ja ?? ""}
            onChange={(e) =>
              field.setValue((prev) => ({ ...prev, ja: e.target.value }))
            }
            placeholder="Ja"
          />
        )}
      </div>
    </Label>
  );
}
