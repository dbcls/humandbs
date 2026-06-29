import { LucideInfo } from "lucide-react";

/**
 * Info badge, used to show small tips
 */
export function InfoBadge({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-form-muted text-sm">
      <LucideInfo className="mr-1 inline size-6" /> {children}
    </p>
  );
}
