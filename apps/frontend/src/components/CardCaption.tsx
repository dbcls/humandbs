import { FA_ICONS } from "@/lib/faIcons";
import { TextWithIcon } from "./TextWithIcon";
import { Badge } from "./ui/badge";

export function CardCaption({
  title,
  children,
  badge,
  icon,
  right,
}: {
  title?: string;
  icon?: keyof typeof FA_ICONS;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const iconToShow = icon && icon in FA_ICONS ? FA_ICONS[icon] : null;
  return (
    <div className="flex items-end justify-between">
      <div className="flex items-end gap-4">
        <div>
          <span className="text-xs">{title}</span>

          <TextWithIcon className="flex text-3xl leading-8" icon={iconToShow}>
            {children}
          </TextWithIcon>
        </div>
        {badge && <Badge> {badge} </Badge>}
      </div>
      {right}
    </div>
  );
}
