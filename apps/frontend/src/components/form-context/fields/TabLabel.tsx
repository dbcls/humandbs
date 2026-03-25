import { ModifiedTag } from "./ModifiedTag";

/**
 * Wraps a tab trigger label with an optional "Modified" badge.
 */
export function TabLabel({
  dirty,
  children,
}: {
  dirty: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1">
      {children}
      <ModifiedTag isModified={dirty} />
    </span>
  );
}
