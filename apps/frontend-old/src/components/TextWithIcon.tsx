import { cn } from "@/lib/utils";

function TextWithIcon({
  children,
  icon,
  className,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-1", className)}>
      {icon}
      <span>{children}</span>
    </span>
  );
}

export { TextWithIcon };
