import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Locale } from "@/config/i18n";
import { i18n } from "@/config/i18n";

export function LocaleSwitcher({
  locale,
  onSwitchLocale,
}: {
  locale: Locale;
  onSwitchLocale: (locale: Locale) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={locale}
      onValueChange={(value) => {
        if (!value) return;
        onSwitchLocale(value as Locale);
      }}
    >
      {i18n.locales.map((loc) => (
        <ToggleGroupItem className="cursor-pointer capitalize" key={loc} value={loc}>
          {loc}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
