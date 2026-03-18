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
}: {
  label?: React.ReactNode;
  variant?: "text" | "textarea";
}) {
  const field = useFieldContext<BilingualTextValue>();

  return (
    <div className="flex flex-col items-start gap-2">
      <span>{label ?? "Text Value"}</span>
      <div className="flex gap-2">
        {variant === "textarea" ? (
          <TextareaAutosize
            minRows={5}
            maxRows={5}
            className="resize-none"
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
          />
        )}

        {variant === "textarea" ? (
          <TextareaAutosize
            minRows={5}
            maxRows={5}
            className="resize-none"
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
          />
        )}
      </div>
    </div>
  );
}
