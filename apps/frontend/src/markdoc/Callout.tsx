import { FA_ICONS } from "@/lib/faIcons";
import { cn } from "@/lib/utils";

export function Callout({
  children,
  type,
}: {
  children: React.ReactNode;
  type: "info" | "tip" | "error";
}) {
  return (
    <div
      className={cn(
        "border-secondary flex items-center gap-10 rounded-md border px-10 shadow-md",
        {
          "border-amber-300": type === "tip",
          "border-red-600": type === "error",
        }
      )}
    >
      {type === "info" && FA_ICONS.info}
      {type === "tip" && FA_ICONS.tip}
      {type === "error" && FA_ICONS.warning}

      <div>{children}</div>
    </div>
  );
}
