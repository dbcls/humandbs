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
      data-active={isActive}
      className={cn(
        "group flex cursor-pointer items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm transition-colors",
        "data-[active=true]:bg-secondary-light data-[active=true]:text-white",
        "data-[active=false]:hover:bg-hover",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
