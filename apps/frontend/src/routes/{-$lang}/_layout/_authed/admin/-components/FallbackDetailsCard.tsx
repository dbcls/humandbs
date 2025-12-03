import { Card } from "@/components/Card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { i18n } from "@/config/i18n-config";

export function FallbackDetailsCard() {
  return (
    <Card
      className="flex h-full flex-1 flex-col"
      containerClassName="flex flex-col flex-1"
      captionSize={"sm"}
      caption={
        <span className="flex items-center gap-5">
          <span>Details</span>

          <ToggleGroup type="single" value={i18n.defaultLocale}>
            {i18n.locales.map((loc) => (
              <ToggleGroupItem
                className="capitalize"
                disabled={true}
                key={loc}
                value={loc}
              >
                {loc}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </span>
      }
    />
  );
}
