import { Label } from "../ui/label";

export function FieldsetWithLabel({
  children,
  label,
}: {
  children?: React.ReactNode;
  label?: React.ReactNode;
}) {
  return (
    <fieldset className="relative mt-5 flex flex-col gap-1.5 rounded-md border border-form-border px-2 pt-6 pb-2">
      {label && (
        <Label className="absolute top-0 left-2 -translate-y-1/2 bg-white px-1 py-0.5 text-sm">
          {label}
        </Label>
      )}
      {children}
    </fieldset>
  );
}
