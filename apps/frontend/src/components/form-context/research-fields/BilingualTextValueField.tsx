import { evaluate } from "@tanstack/react-form";
import type { z } from "zod";

import { ResearchDetailSchema } from "@humandbs/backend/types";

import { capitalize } from "@/components/FrontStatsVisualization/utils";
import { useFieldContext } from "@/components/form-context/FormContext";
import { ResetFieldButton } from "@/components/form-context/fields/ResetFieldButton";
import { getFieldDefaultValue } from "@/components/form-context/fields/useFieldModified";
import { Input } from "@/components/Input";
import { TextareaAutosize } from "@/components/ui/textarea";
import type { Locale } from "@/config/i18n";
import { i18n } from "@/config/i18n";
import { cn } from "@/lib/utils";

const BilingualTextValueSchema = ResearchDetailSchema.pick({ summary: true });

export type BilingualTextValue = z.infer<typeof BilingualTextValueSchema>["summary"]["aims"];

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
  const initial = getFieldDefaultValue(field) as BilingualTextValue | undefined;

  function handleChangeValue(value: string, locale: Locale) {
    field.handleChange((prev) => ({
      ...prev,
      [locale]: { ...prev?.[locale], text: value },
    }));
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <span className="font-medium text-sm">{label ?? "Text Value"}</span>
      <div className={inputsClassName ?? "flex gap-2"}>
        {i18n.locales.map((locale) => {
          const isModified = !evaluate(field.state.value?.[locale]?.text, initial?.[locale]?.text);

          return (
            <div key={locale} className="relative flex-1">
              {variant === "textarea" ? (
                <TextareaAutosize
                  minRows={5}
                  maxRows={5}
                  className={cn(
                    "w-full resize-none rounded-lg px-3 py-2 text-sm disabled:opacity-100",
                    "group-disabled/fieldset:disabled-text-field",
                    { "modified-field": isModified },
                  )}
                  value={field.state.value?.[locale]?.text ?? ""}
                  onChange={(e) => handleChangeValue(e.target.value, locale)}
                  placeholder={capitalize(locale)}
                />
              ) : (
                <Input
                  type="text"
                  value={field.state.value?.[locale]?.text ?? ""}
                  onChange={(e) => handleChangeValue(e.target.value, locale)}
                  placeholder={capitalize(locale)}
                  variant="form"
                  className={isModified ? "modified-field" : undefined}
                />
              )}
              {isModified && (
                <ResetFieldButton
                  className="top-2"
                  onClick={() =>
                    field.handleChange((prev) => ({
                      ...prev,
                      [locale]: initial?.[locale] ?? { text: "", rawHtml: "" },
                    }))
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
