import { useFieldContext } from "@/components/form-context/FormContext";
import { Input } from "@/components/Input";
import { Label } from "@/components/ui/label";
import { ResearchDetailSchema } from "@humandbs/backend/types";
import { z } from "zod";

const BilingualTextSchema = ResearchDetailSchema.pick({ title: true });

type BilingualText = z.infer<typeof BilingualTextSchema>["title"];

export default function BilingualTextField({
  label,
}: {
  label?: React.ReactNode;
}) {
  const field = useFieldContext<BilingualText>();

  return (
    <Label className="flex w-full flex-col items-stretch gap-2">
      <span>{label ?? "Text"}</span>
      <div className="flex w-full gap-2">
        <Input
          type="text"
          variant="form"
          className={`flex-1 ${field.state.meta.isDirty ? "bg-yellow-50" : ""}`}
          value={field.state.value.en ?? ""}
          onChange={(e) =>
            field.handleChange((prev) => ({ ...prev, en: e.target.value }))
          }
          placeholder="En"
        />
        <Input
          type="text"
          variant="form"
          className={`flex-1 ${field.state.meta.isDirty ? "bg-yellow-50" : ""}`}
          value={field.state.value.ja ?? ""}
          onChange={(e) =>
            field.setValue((prev) => ({ ...prev, ja: e.target.value }))
          }
          placeholder="Ja"
        />
      </div>
    </Label>
  );
}
