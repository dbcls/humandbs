import { Card } from "@/components/Card";
import { TextWithIcon } from "@/components/TextWithIcon";

export function NoSelectedItemMessage({
  children,
  icon,
}: {
  children?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Card
      className="h-fit w-full flex-1"
      containerClassName="text-foreground-light flex flex-1 items-center justify-center"
    >
      <TextWithIcon className="items-center [&_svg:not([class*='size-'])]:size-7" icon={icon}>
        {children ?? "Select an item to view/edit"}
      </TextWithIcon>
    </Card>
  );
}
