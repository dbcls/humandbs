import { FA_ICONS } from "@/lib/faIcons";
import { cn } from "@/lib/utils";

export function Callout({
  children,
  type,
  title,
}: {
  children?: React.ReactNode;
  type: "info" | "tip" | "error" | "warning";
  title?: string;
}) {
  return (
    <div
      className={cn(
        "border-secondary mt-2 flex items-center gap-10 rounded-md border px-10 shadow-md",
        {
          "border-blue-600": type === "info",
          "border-secondary-light": type === "tip",
          "border-amber-300": type === "warning",
          "border-red-600": type === "error",
        },
      )}
    >
      {type === "info" && FA_ICONS.info}
      {type === "tip" && FA_ICONS.tip}
      {(type === "error" || type === "warning") && FA_ICONS.warning}

      <div>
        {title ? <p className="mb-1 font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
