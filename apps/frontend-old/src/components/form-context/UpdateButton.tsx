import { Button } from "../ui/button";

import { useFormContext } from "./FormContext";

export default function SumbitButton({
  submitAction,
  label,
}: {
  submitAction: string | null;
  label?: string;
}) {
  const form = useFormContext();

  return (
    <form.Subscribe selector={(state) => [state.isSubmitting, state.canSubmit]}>
      {([isSubmitting, canSubmit]) => (
        <Button
          variant={"action"}
          onClick={() => form.handleSubmit({ submitAction })}
          disabled={!canSubmit || isSubmitting}
        >
          {label}
        </Button>
      )}
    </form.Subscribe>
  );
}
