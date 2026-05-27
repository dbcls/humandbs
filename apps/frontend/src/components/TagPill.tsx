import type { ReactNode } from "react";

export function TagPill({
  color,
  text,
  children,
}: {
  color?: string | null;
  text?: string | null;
  children?: ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-gray-500 bg-gray-200 px-2 py-0.5 font-medium text-gray-500 text-xs"
      style={{
        backgroundColor: color ?? undefined,
        color: color ?? undefined,
        borderColor: color ?? undefined,
      }}
    >
      {text ?? null}
      {children}
    </span>
  );
}
