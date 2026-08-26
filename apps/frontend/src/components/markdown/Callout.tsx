import { FA_ICONS } from "@/lib/faIcons";
import { cn } from "@/lib/utils";

export type CalloutType = "info" | "tip" | "error" | "warning" | "plain";

export function Callout({
  children,
  type,
  title,
}: {
  children?: React.ReactNode;
  type: CalloutType;
  title?: string;
}) {
  return (
    <div
      className={cn("mt-2 flex items-center gap-4 rounded-md border border-secondary px-6 py-4", {
        "border-secondary": type === "info",
        "border-secondary-light": type === "tip",
        "border-amber-300": type === "warning",
        "border-red-600": type === "error",
      })}
    >
      <CalloutIcon type={type} />

      <div className="[&>p]:my-0">
        {title ? <p className="mb-1 font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

function CalloutIcon({ type }: { type: CalloutType }) {
  switch (type) {
    case "plain":
      return null;
    case "info":
      return FA_ICONS.info;
    case "tip":
      return FA_ICONS.tip;
    case "error":
      return FA_ICONS.error;
    case "warning":
      return FA_ICONS.warning;
    default:
      return FA_ICONS.tip;
  }
}
