import { Suspense, useState } from "react";

import { Card } from "@/components/Card";
import { SkeletonLoading } from "@/components/Skeleton";
import { cn } from "@/lib/utils";

export function FilterableCard({
  caption,
  captionSize,
  className,
  children,
  renderPanel,
}: {
  caption: (props: { onFilterClick: () => void }) => React.ReactNode;
  captionSize?: "lg";
  className?: string;
  children: React.ReactNode;
  renderPanel: (props: { onClose: () => void }) => React.ReactNode;
}) {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <Card
      className={className}
      caption={caption({
        onFilterClick: () => {
          setPanelOpen((v) => !v);
        },
      })}
      captionSize={captionSize}
      containerClassName="relative overflow-hidden"
    >
      <Suspense fallback={<SkeletonLoading />}>{children}</Suspense>

      <div
        className={cn(
          "absolute inset-y-0 right-0 z-10 min-w-96 overflow-y-auto border-l border-l-primary-translucent bg-white shadow-lg",
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
