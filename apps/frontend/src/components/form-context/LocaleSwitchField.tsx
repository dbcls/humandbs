import { i18n, Locale } from "@/config/i18n-config";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { useFieldContext } from "./FormContext";

export default function LocaleSwitchField() {
  const field = useFieldContext<Locale>();

  return (
    <ToggleGroup
      type="single"
      value={field.state.value}
      onValueChange={(value) => {
        if (!value) return;
        field.setValue(value as Locale);
      }}
    >
      {i18n.locales.map((loc) => (
        <ToggleGroupItem
          className="cursor-pointer capitalize"
          key={loc}
          value={loc}
        >
          {loc}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
