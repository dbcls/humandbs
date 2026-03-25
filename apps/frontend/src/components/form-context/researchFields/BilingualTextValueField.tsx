import { useFieldContext } from "@/components/form-context/FormContext";
import { Input } from "@/components/Input";
import { TextareaAutosize } from "@/components/ui/textarea";
import { ResearchDetailSchema } from "@humandbs/backend/types";
import { z } from "zod";

const BilingualTextValueSchema = ResearchDetailSchema.pick({ summary: true });

export type BilingualTextValue = z.infer<
  typeof BilingualTextValueSchema
>["summary"]["aims"];

export default function BilingualTextValueField({
  label,
  variant = "textarea",
  inputsClassName,
}: {
  label?: React.ReactNode;
  variant?: "text" | "textarea";
  inputsClassName?: string;
}) {
  const field = useFieldContext<BilingualTextValue>();

  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-sm font-medium">{label ?? "Text Value"}</span>
      <div className={inputsClassName ?? "flex gap-2"}>
        {variant === "textarea" ? (
          <TextareaAutosize
            minRows={5}
            maxRows={5}
            className={`flex-1 resize-none rounded-lg bg-primary px-3 py-2 text-sm ${field.state.meta.isDirty ? "bg-yellow-50" : ""}`}
            value={field.state.value?.en?.text ?? ""}
            onChange={(e) =>
              field.handleChange((prev) => ({
                ...prev,
                en: { text: e.target.value, rawHtml: "" },
              }))
            }
            placeholder="En"
          />
        ) : (
          <Input
            type="text"
            value={field.state.value?.en?.text ?? ""}
            onChange={(e) =>
              field.handleChange((prev) => ({
                ...prev,
                en: { text: e.target.value, rawHtml: "" },
              }))
            }
            placeholder="En"
            variant="form"
            className={field.state.meta.isDirty ? "bg-yellow-50" : undefined}
          />
        )}

        {variant === "textarea" ? (
          <TextareaAutosize
            minRows={5}
            maxRows={5}
            className={`flex-1 resize-none rounded-lg bg-primary px-3 py-2 text-sm ${field.state.meta.isDirty ? "bg-yellow-50" : ""}`}
            value={field.state.value?.ja?.text ?? ""}
            onChange={(e) =>
              field.setValue((prev) => ({
                ...prev,
                ja: { text: e.target.value, rawHtml: "" },
              }))
            }
            placeholder="Ja"
          />
        ) : (
          <Input
            type="text"
            value={field.state.value?.ja?.text ?? ""}
            onChange={(e) =>
              field.setValue((prev) => ({
                ...prev,
                ja: { text: e.target.value, rawHtml: "" },
              }))
            }
            placeholder="Ja"
            variant="form"
            className={field.state.meta.isDirty ? "bg-yellow-50" : undefined}
          />
        )}
      </div>
    </div>
  );
}
