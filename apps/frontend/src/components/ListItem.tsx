import { cn } from "@/lib/utils";

interface ListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  isActive?: boolean;
  children: React.ReactNode;
}

export function ListItem({
  isActive = false,
  children,
  className,
  ...rest
}: ListItemProps) {
  return (
    <div
      className={cn(
        "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-3 py-1 text-sm transition-colors",
        {
          "bg-secondary-light text-white [&>svg>path]:stroke-white": isActive,
          "hover:bg-hover": !isActive,
        },
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
