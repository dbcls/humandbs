import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import type { StandardSchemaV1 } from "@tanstack/form-core";

import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAppForm } from "./form-context/FormContext";

interface InputDialogProps {
  title: string;
  description?: string;
  label: string;
  trigger: React.ReactNode;
  /** Standard schema (e.g. Zod) for on-submit validation */
  submitSchema?: StandardSchemaV1<string>;
  /** Async validation (debounced). Return an error string or undefined. */
  validateAsync?: (value: string) => Promise<string | undefined>;
  validateAsyncDebounceMs?: number;
  onSubmit: (value: string) => Promise<unknown>;
  /** Applied to the trimmed value before onSubmit */
  transformValue?: (value: string) => string;
  /** Controlled open state. Omit to use internal state driven by trigger. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function InputDialog({
  title,
  description,
  label,
  trigger,
  submitSchema,
  validateAsync,
  validateAsyncDebounceMs = 500,
  onSubmit,
  transformValue,
  open: openProp,
  onOpenChange,
}: InputDialogProps) {
  const [openInternal, setOpenInternal] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInternal;

  const form = useAppForm({
    defaultValues: { value: "" },
    onSubmit: async ({ value }) => {
      const trimmed = value.value.trim();
      const transformed = transformValue ? transformValue(trimmed) : trimmed;
      await onSubmit(transformed);
      handleOpenChange(false);
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next) form.reset();
    if (isControlled) {
      onOpenChange?.(next);
    } else {
      setOpenInternal(next);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-base">{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="flex flex-col gap-2"
        >
          <form.AppField
            name="value"
            validators={{
              ...(submitSchema && { onSubmit: submitSchema }),
              ...(validateAsync && {
                onChangeAsyncDebounceMs: validateAsyncDebounceMs,
                onChangeAsync: ({ value }) => validateAsync(value),
              }),
            }}
          >
            {(field) => <field.TextField type="inline" label={label} />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => (
              <Button type="submit" className="self-end" disabled={!canSubmit}>
                Submit
              </Button>
            )}
          </form.Subscribe>
        </form>
      </DialogContent>
    </Dialog>
  );
}
