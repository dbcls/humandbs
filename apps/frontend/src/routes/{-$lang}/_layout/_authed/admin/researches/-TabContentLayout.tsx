import type { ReactNode } from "react";

interface TabContentLayoutProps {
  header: ReactNode;
  actions?: ReactNode;
  /** Scrollable main content */
  children: ReactNode;
}

/**
 * Shared shell for all tab content panels in ResearchDetails.
 * Renders a fixed header row (breadcrumb + action buttons) and a
 * vertically-scrollable body below it.
 */
export function TabContentLayout({ header, actions, children }: TabContentLayoutProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between px-5 pt-5">
        <div>{header}</div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5">{children}</div>
    </div>
  );
}
