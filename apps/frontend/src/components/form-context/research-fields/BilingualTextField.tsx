import type { z } from "zod";

import { useState } from "react";

import { ResearchDetailSchema } from "@humandbs/backend/types";

import { capitalize } from "@/components/FrontStatsVisualization/utils";
import { useFieldContext } from "@/components/form-context/FormContext";
import { ResetFieldButton } from "@/components/form-context/fields/ResetFieldButton";
import {
  isFieldModified,
  resetFieldKeyToDefault,
} from "@/components/form-context/fields/useFieldModified";
import { Input } from "@/components/Input";
import { Label } from "@/components/ui/label";
import { TextareaAutosize } from "@/components/ui/textarea";
import type { Locale } from "@/config/i18n";
import { i18n } from "@/config/i18n";
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
  const [textareaHeights, setTextareaHeights] = useState<Partial<Record<Locale, number>>>({});
  const textareaHeight = Math.max(0, ...Object.values(textareaHeights));

  function handleTextareaHeightChange(height: number, locale: Locale) {
    setTextareaHeights((current) =>
      current[locale] === height ? current : { ...current, [locale]: height },
    );
  }

  function handleChaneValue(value: string, locale: Locale) {
    field.setValue((prev) => ({ ...prev, [locale]: value }));
  }
  return (
    <Label className="flex w-full flex-col items-stretch gap-2">
      <span>{label}</span>
      <div className="flex w-full gap-2">
        {i18n.locales.map((locale) => {
          const isModified = isFieldModified(field, locale);

          return (
            <div key={locale} className="relative flex flex-1 items-start">
              {variant === "textarea" ? (
                <TextareaAutosize
                  minRows={2}
                  style={textareaHeight > 0 ? { height: textareaHeight } : undefined}
                  onHeightChange={(height) => handleTextareaHeightChange(height, locale)}
                  className={cn(
                    "flex-1 resize-none rounded-lg bg-input px-3 py-2 text-sm disabled:opacity-100",
                    "group-disabled/fieldset:disabled-text-field",
                    {
                      "modified-field": isModified,
                    },
                  )}
                  value={field.state.value[locale] ?? ""}
                  onChange={(e) => handleChaneValue(e.target.value, locale)}
                  placeholder={capitalize(locale)}
                />
              ) : (
                <Input
                  type="text"
                  variant="form"
                  className={cn("flex-1 bg-input", { "modified-field": isModified })}
                  value={field.state.value[locale] ?? ""}
                  onChange={(e) => {
                    handleChaneValue(e.target.value, locale);
                  }}
                  placeholder={capitalize(locale)}
                />
              )}
              {isFieldModified(field, locale) && (
                <ResetFieldButton onClick={() => resetFieldKeyToDefault(field, locale)} />
              )}
            </div>
          );
        })}
      </div>
    </Label>
  );
}
