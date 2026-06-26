import { ChevronRight } from "lucide-react";
import { useTranslations } from "use-intl";

import { useEffect, useRef, useState } from "react";

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
  }, [maxHeight]);

  return (
    <Dialog>
      <div className="flex w-full flex-col gap-1">
        <div
          ref={contentRef}
          style={{ maxHeight: `${maxHeight}px` }}
          className={cn("relative w-full overflow-hidden")}
        >
          {children}
          {isOverflowing && (
            <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-t from-white to-transparent group-hover:from-gray-50" />
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
              className="-ml-2 h-auto self-start px-2 py-1.5 text-foreground-light text-xs hover:bg-neutral-100 hover:text-foreground group-hover:bg-gray-50"
            >
              {t("read-more")}
              <ChevronRight className="ml-1 size-3" />
            </Button>
          </DialogTrigger>
        )}
      </div>

      <DialogContent
        className="flex max-h-[85vh] w-full flex-col rounded-3xl border-none px-12 py-10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.3)] sm:max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <DialogHeader>
            <DialogTitle className="text-xl">{title}</DialogTitle>
          </DialogHeader>
        ) : (
          <DialogTitle className="sr-only">{t("details") || "Details"}</DialogTitle>
        )}
        <div className="flex-1 overflow-y-auto p-2 text-base leading-[1.8] [&_li]:text-base [&_li]:leading-[1.8] [&_p]:text-base [&_p]:leading-[1.8]">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
