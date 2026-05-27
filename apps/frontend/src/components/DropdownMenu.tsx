import { Fragment } from "react";

import {
  DropdownMenu as DropdownMenuBase,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  dropdownItems: {
    group?: string;
    item: React.ReactNode;
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  }[];
}

export function DropdownMenu({ trigger, dropdownItems }: DropdownMenuProps) {
  const grouped = dropdownItems.reduce(
    (acc, curr) => {
      if (!curr.group) {
        if (!acc.ungrouped) {
          acc.ungrouped = [curr];
        } else {
          acc.ungrouped.push(curr);
        }
      } else {
        if (!acc[curr.group]) {
          acc[curr.group] = [curr];
        } else {
          acc[curr.group].push(curr);
        }
      }

      return acc;
    },
    {} as Record<string, typeof dropdownItems>,
  );

  return (
    <DropdownMenuBase>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent>
        {Object.entries(grouped).map(([group, items], index, array) => (
          <Fragment key={group}>
            <DropdownMenuGroup key={group}>
              {group === "ungrouped" ? null : <DropdownMenuLabel>{group}</DropdownMenuLabel>}
              {items.map((item, i) => (
                <DropdownMenuItem onClick={(e) => item.onClick(e)} key={i}>
                  {item.item}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            {index === array.length - 1 ? null : <DropdownMenuSeparator />}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenuBase>
  );
}
