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

  console.log("field.state", field.state);
  return (
    <Label className="flex w-fit flex-col items-start gap-2">
      <span>{label ?? "Text"}</span>
      <div className="flex gap-2">
        <Input
          type="text"
          variant="form"
          value={field.state.value.en ?? ""}
          onChange={(e) =>
            field.handleChange((prev) => ({ ...prev, en: e.target.value }))
          }
          placeholder="En"
        />
        <Input
          type="text"
          variant="form"
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
