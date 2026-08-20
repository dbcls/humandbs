import { cn } from "@/lib/utils";

export function LangFormLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("font-medium text-form-label text-xs uppercase", className)}>{children}</div>
  );
}
