import { LucideInfo } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Info badge, used to show small tips
 */
export function InfoBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("mb-4 text-form-muted text-sm", className)}>
      <LucideInfo className="mr-1 inline size-6" /> {children}
    </p>
  );
}
