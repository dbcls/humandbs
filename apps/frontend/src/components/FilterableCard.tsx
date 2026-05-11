import { Suspense, useState } from "react";

import { Card } from "@/components/Card";
import { SkeletonLoading } from "@/components/Skeleton";
import { cn } from "@/lib/utils";

/**
 * Card wrapper component with filter panel.
 * Used by /researches and by /datasets.
 *
 */
export function FilterableCard({
  caption,
  captionSize,
  className,
  children,
  renderPanel,
}: {
  caption: (props: {
    onFilterClick: () => void;
    isOpen: boolean;
  }) => React.ReactNode;
  captionSize?: "lg";
  className?: string;
  children?: React.ReactNode;
  renderPanel: (props: { onClose: () => void }) => React.ReactNode;
}) {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <Card
      className={cn("flex-1", className)}
      caption={caption({
        onFilterClick: () => {
          setPanelOpen((v) => !v);
        },
        isOpen: panelOpen,
      })}
      captionSize={captionSize}
      hideCaptionBorder={true}
      containerClassName={"relative overflow-hidden flex-1 min-h-[50vh]"}
    >
      <Suspense fallback={<SkeletonLoading />}>
        <div
          className={cn("flex min-h-[inherit] flex-col", {
            "pr-filter-panel": panelOpen,
          })}
        >
          {children}
        </div>
      </Suspense>

      {/*Filters side panel */}
      <div
        className={cn(
          "w-filter-panel border-l-primary-translucent absolute top-0 right-0 z-50 h-full overflow-y-auto border-l bg-white shadow-lg",
          "transition-transform duration-300 ease-in-out",
          {
            "translate-x-full shadow-none": !panelOpen,
          },
        )}
      >
        {panelOpen ? (
          <Suspense>
            {renderPanel({
              onClose: () => {
                setPanelOpen(false);
              },
            })}
          </Suspense>
        ) : null}
      </div>
    </Card>
  );
}
