import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

import { useFieldContext } from "./FormContext";

export default function SwitchField<V extends string>({
  options,
}: {
  options: { value: V; label: React.ReactNode }[];
}) {
  const field = useFieldContext<V>();

  return (
    <ToggleGroup
      type="single"
      value={field.state.value}
      onValueChange={(value) => {
        if (value) {
          field.setValue(value as V);
        }
      }}
    >
      {options.map((opt) => (
        <ToggleGroupItem
          className="cursor-pointer"
          key={opt.value}
          value={opt.value}
        >
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
