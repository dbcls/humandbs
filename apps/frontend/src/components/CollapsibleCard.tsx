import { useTogglePanel } from "@/hooks/useTogglePanel";
import { Card } from "./Card";
import { Button } from "./ui/button";
import { SidebarCloseIcon, SidebarOpenIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A card that can be vertically collapsed */
export function CollapsibleCard({
  title,
  children,
  className,
  wLeftPanel,
}: {
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  wLeftPanel?: boolean;
}) {
  const {
    open,
    handleTransitionEnd,
    handleTransitionStart,
    renderContent,
    togglePanel,
  } = useTogglePanel();

  return (
    <Card
      caption={
        <div
          className={cn("relative flex justify-between", {
            "justify-end": !title,
          })}
        >
          {title ? (
            <span
              id="title"
              className={cn("z-30 origin-bottom-left transition-transform", {
                "absolute rotate-90": !open,
              })}
            >
              {title}
            </span>
          ) : null}
          <Button
            onClick={togglePanel}
            variant={"plain"}
            className="hover:bg-hover"
            size={"icon"}
          >
            {open ? (
              <SidebarCloseIcon className="size-4" />
            ) : (
              <SidebarOpenIcon className="size-4" />
            )}
          </Button>
        </div>
      }
      className={cn(
        "flex h-full flex-col transition-[width] duration-300",
        {
          "w-20 overflow-clip **:min-w-max": !open,
          "w-cms-list-panel": open && !wLeftPanel,
          "w-cms-side-panel overflow-clip **:min-w-max": open && wLeftPanel,
        },
        className,
      )}
      containerClassName="flex-1 flex flex-col max-h-full"
      captionClassName={cn({
        "before:hidden pl-0": !open || !title,
      })}
      onTransitionEnd={handleTransitionEnd}
      onTransitionStart={handleTransitionStart}
    >
      {renderContent ? children : null}
    </Card>
  );
}
