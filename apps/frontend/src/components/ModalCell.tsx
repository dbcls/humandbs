import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "use-intl";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { Button } from "./ui/button";

export function ModalCell({
  children,
  maxHeight = 96,
  title,
}: {
  children: React.ReactNode;
  maxHeight?: number;
  title?: string;
}) {
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("common");

  useEffect(() => {
    if (!contentRef.current) return;

    const checkOverflow = () => {
      if (contentRef.current) {
        setIsOverflowing(contentRef.current.scrollHeight > maxHeight);
      }
    };
    
    checkOverflow();

    const resizeObserver = new ResizeObserver(() => {
      checkOverflow();
    });

    resizeObserver.observe(contentRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [maxHeight, children]);

  return (
    <Dialog>
      <div className="flex flex-col gap-1 w-full">
        <div
          ref={contentRef}
          style={{ maxHeight: `${maxHeight}px` }}
          className={cn("overflow-hidden relative w-full")}
        >
          {children}
          {isOverflowing && (
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white group-hover:from-gray-50 to-transparent pointer-events-none" />
          )}
        </div>
        
        {isOverflowing && (
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="text-foreground-light hover:text-foreground hover:bg-neutral-100 group-hover:bg-gray-50 self-start h-auto py-1.5 px-2 text-xs -ml-2"
            >
              {t("read-more")}
              <ChevronRight className="ml-1 size-3" />
            </Button>
          </DialogTrigger>
        )}
      </div>

      <DialogContent 
        className="sm:max-w-4xl w-full max-h-[85vh] flex flex-col border-none rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.3)] py-10 px-12" 
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <DialogHeader>
            <DialogTitle className="text-xl">{title}</DialogTitle>
          </DialogHeader>
        ) : (
          <DialogTitle className="sr-only">{t("details") || "Details"}</DialogTitle>
        )}
        <div className="overflow-y-auto flex-1 p-2 text-base leading-[1.8] [&_p]:text-base [&_p]:leading-[1.8] [&_li]:text-base [&_li]:leading-[1.8]">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
