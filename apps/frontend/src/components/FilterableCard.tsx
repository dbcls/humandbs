import { Suspense, useState } from "react";

import { Card } from "@/components/Card";
import { SkeletonLoading } from "@/components/Skeleton";
import { cn } from "@/lib/utils";

export function FilterableCard({
  caption,
  captionSize,
  className,
  renderChildren,
  renderPanel,
}: {
  caption: (props: {
    onFilterClick: () => void;
    isOpen: boolean;
  }) => React.ReactNode;
  captionSize?: "lg";
  className?: string;
  renderChildren: (props: { panelOpen: boolean }) => React.ReactNode;
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
      containerClassName={cn(
        "relative overflow-x-clip flex flex-col flex-1",
        panelOpen && "min-h-screen",
      )}
    >
      <Suspense fallback={<SkeletonLoading />}>
        {renderChildren({ panelOpen })}
      </Suspense>

      <div
        className={cn(
          "absolute top-0 right-0 z-10 min-w-96 max-h-full overflow-y-auto border-l border-l-primary-translucent bg-white shadow-lg",
          "transition-transform duration-300 ease-in-out",
          panelOpen ? "translate-x-0" : "translate-x-full",
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
