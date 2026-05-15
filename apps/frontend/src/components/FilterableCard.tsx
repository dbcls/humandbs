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
      containerClassName={"relative flex-1 min-h-[50vh]"}
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
          "w-filter-panel absolute -top-2 -right-2 z-50 flex flex-col drop-shadow-xl",
          "origin-top-right transition-all duration-300 ease-out",
          "max-h-[calc(100%+1rem)]",
          {
            "scale-95 opacity-0 pointer-events-none invisible": !panelOpen,
            "scale-100 opacity-100 visible": panelOpen,
          },
        )}
      >
        {/* The arrow (caret) pointing up */}
        <div className="absolute -top-[5px] right-[3.5rem] z-10 h-4 w-4 rotate-45 rounded-tl-[2px] border-l border-t border-gray-200 bg-white"></div>

        {/* The actual panel container */}
        <div className="relative z-0 flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <Suspense>
            {renderPanel({
              onClose: () => {
                setPanelOpen(false);
              },
            })}
          </Suspense>
        </div>
      </div>
    </Card>
  );
}
