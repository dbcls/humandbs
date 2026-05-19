import { Suspense, useState, useRef, useEffect } from "react";

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
    filterButtonRef: React.RefObject<HTMLButtonElement | null>;
  }) => React.ReactNode;
  captionSize?: "lg";
  className?: string;
  children?: React.ReactNode;
  renderPanel: (props: { onClose: () => void }) => React.ReactNode;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const [arrowOffset, setArrowOffset] = useState(56);

  useEffect(() => {
    if (!filterButtonRef.current) return;
    const el = filterButtonRef.current;
    
    const updateOffset = () => {
      setArrowOffset(el.offsetWidth / 2);
    };
    
    // updateOffset(); // ResizeObserver fires immediately on observe
    const observer = new ResizeObserver(updateOffset);
    observer.observe(el);
    return () => observer.disconnect();
  }, [caption]);

  return (
    <Card
      className={cn("flex-1", className)}
      captionClassName="sticky top-0 z-40 bg-white py-4 -my-4"
      caption={
        <div className="relative">
          {caption({
            onFilterClick: () => {
              setPanelOpen((v) => !v);
            },
            isOpen: panelOpen,
            filterButtonRef,
          })}

          {/*Filters side panel */}
          <div
            className={cn(
              "w-filter-panel absolute top-[100%] right-0 mt-2 z-50 flex flex-col drop-shadow-xl",
              "origin-top-right transition-all duration-300 ease-out",
              "max-h-[calc(100vh-8rem)]",
              {
                "scale-95 opacity-0 pointer-events-none invisible": !panelOpen,
                "scale-100 opacity-100 visible": panelOpen,
              },
            )}
          >
            {/* The arrow (caret) pointing up */}
            <div 
              className="absolute bottom-[calc(100%-1px)] z-10 w-[16px] h-[8px] transition-all"
              style={{ right: `${arrowOffset - 8}px` }}
            >
              <svg viewBox="0 0 16 8" width="16" height="8" className="block" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 1L15 8H1L8 1Z" className="fill-white" />
                <path d="M8 1L15 8H1L8 1Z" className="fill-secondary/10" />
                <path d="M1 8L8 1L15 8" className="stroke-gray-200" strokeWidth="1" fill="none" />
              </svg>
            </div>

            {/* The actual panel container */}
            <div className="relative z-0 flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <Suspense>
                {renderPanel({
                  onClose: () => {
                    setPanelOpen(false);
                  },
                })}
              </Suspense>
            </div>
          </div>
        </div>
      }
      captionSize={captionSize}
      hideCaptionBorder={true}
      containerClassName={"relative flex-1 min-h-[50vh] !mt-0"}
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
    </Card>
  );
}
