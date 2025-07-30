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
    <div className="flex flex-col gap-3">
      <Label>Locale</Label>
      <ToggleGroup
        type="single"
        value={locale}
        onValueChange={(value) => {
          if (!value) return;
          onSwitchLocale(value as Locale);
        }}
      >
        {i18n.locales.map((loc) => (
          <ToggleGroupItem key={loc} value={loc}>
            {loc}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
