import type { z } from "zod";

import { ResearchDetailSchema } from "@humandbs/backend/types";

import { useFieldContext } from "@/components/form-context/FormContext";
import { ResetFieldButton } from "@/components/form-context/fields/ResetFieldButton";
import {
  isFieldModified,
  resetFieldKeyToDefault,
} from "@/components/form-context/fields/useFieldModified";
import { Input } from "@/components/Input";
import { Label } from "@/components/ui/label";
import { TextareaAutosize } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  const isEnModified = isFieldModified(field, "en");
  const isJaModified = isFieldModified(field, "ja");

  return (
    <Label className="flex w-full flex-col items-stretch gap-2">
      <span>{label ?? "Text"}</span>
      <div className="flex w-full gap-2">
        <div className="relative flex flex-1 items-center">
          {variant === "textarea" ? (
            <TextareaAutosize
              minRows={2}
              className={cn(`flex-1 resize-none rounded-lg px-3 py-2 text-sm`, {
                "modified-field": isEnModified,
              })}
              value={field.state.value.en ?? ""}
              onChange={(e) => field.handleChange((prev) => ({ ...prev, en: e.target.value }))}
              placeholder="En"
            />
          ) : (
            <Input
              type="text"
              variant="form"
              className={`flex-1 ${isEnModified ? "modified-field" : ""}`}
              value={field.state.value.en ?? ""}
              onChange={(e) => field.handleChange((prev) => ({ ...prev, en: e.target.value }))}
              placeholder="En"
            />
          )}
          {isEnModified && <ResetFieldButton onClick={() => resetFieldKeyToDefault(field, "en")} />}
        </div>
        <div className="relative flex flex-1 items-center">
          {variant === "textarea" ? (
            <TextareaAutosize
              minRows={2}
              className={cn(`flex-1 resize-none rounded-lg px-3 py-2 text-sm`, {
                "modified-field": isJaModified,
              })}
              value={field.state.value.ja ?? ""}
              onChange={(e) => field.setValue((prev) => ({ ...prev, ja: e.target.value }))}
              placeholder="Ja"
            />
          ) : (
            <Input
              type="text"
              variant="form"
              className={`flex-1 ${isJaModified ? "modified-field" : ""}`}
              value={field.state.value.ja ?? ""}
              onChange={(e) => field.setValue((prev) => ({ ...prev, ja: e.target.value }))}
              placeholder="Ja"
            />
          )}
          {isJaModified && <ResetFieldButton onClick={() => resetFieldKeyToDefault(field, "ja")} />}
        </div>
      </div>
    </Label>
  );
}
