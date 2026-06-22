import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type NoticeVariant = "default" | "success" | "error" | "warning";

const variantClassMap: Record<NoticeVariant, string> = {
  default: "border-slate-200 bg-slate-50 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
};

export function AssistantNotice({
  children,
  variant = "default",
  className,
}: {
  children: ReactNode;
  variant?: NoticeVariant;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border px-3 py-2 text-sm", variantClassMap[variant], className)}>
      {children}
    </div>
  );
}
