import { cn } from "@/lib/utils";

export function AdminStatusMessage({
  children,
  variant = "error",
  className,
  preserveWhitespace = false,
}: {
  children: React.ReactNode;
  variant?: "error" | "success" | "warning";
  className?: string;
  preserveWhitespace?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded border p-3 text-sm",
        variant === "error" && "border-red-200 bg-red-50 text-danger",
        variant === "success" && "border-green-200 bg-green-50 text-green-800",
        variant === "warning" && "border-amber-200 bg-amber-50 text-amber-800",
        preserveWhitespace && "whitespace-pre-wrap",
        className,
      )}
    >
      {children}
    </div>
  );
}
