import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { i18n, Locale } from "@/lib/i18n-config";

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
        <ToggleGroupItem className="capitalize" key={loc} value={loc}>
          {loc}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
