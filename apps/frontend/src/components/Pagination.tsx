import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "use-intl";

import { useEffect, useState } from "react";

import type { Pagination as APIPagination } from "@humandbs/backend/types";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface PaginationProps {
  pagination: APIPagination;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  className?: string;
}

export function Pagination({ pagination, onItemsPerPageChange, className }: PaginationProps) {
  const navigate = useNavigate();
  const t = useTranslations("Pagination");
  const [sliderValue, setSliderValue] = useState(pagination.page);

  useEffect(() => {
    setSliderValue(pagination.page);
  }, [pagination.page]);

  const handleItemsPerPageChange = (value: string) => {
    const newItemsPerPage = parseInt(value, 10);
    if (onItemsPerPageChange) {
      onItemsPerPageChange(newItemsPerPage);
    }
    navigate({
      to: ".",
      search: (prev) => ({ ...prev, page: 1, limit: newItemsPerPage }),
      resetScroll: false,
    });
  };

  const handlePageNavigate = (targetPage: number) => {
    const page = Math.min(pagination.totalPages, Math.max(1, targetPage));
    if (page === pagination.page) return;

    setSliderValue(page);
    navigate({
      to: ".",
      search: (prev) => ({ ...prev, page }),
      resetScroll: false,
    });
  };

  const percentage =
    pagination.totalPages > 1 ? ((sliderValue - 1) / (pagination.totalPages - 1)) * 100 : 0;

  // Root base font-size is 10px (62.5%), so 2.75rem = exactly 27.5px.
  // Using w-max (width: max-content) + min-width: 2.75rem + px-3.5:
  // 1-digit fits comfortably inside 2.75rem min-width -> perfect 27.5px x 27.5px circle!
  // 2+ digits naturally exceed 2.75rem min-width with px-3.5 padding -> smoothly expands into capsule shape!
  const pageStr = String(sliderValue);
  const thumbWidthRem = Math.max(2.75, 1.5 + pageStr.length * 0.75);
  const thumbLeft = `calc(${percentage}% + ${0.5 - percentage / 100} * ${thumbWidthRem}rem)`;

  return (
    <div
      className={cn(
        "mt-4 flex w-full flex-col items-center justify-between gap-6 sm:flex-row sm:gap-10",
        className,
      )}
    >
      <div className="flex w-full flex-1 items-center gap-3 sm:w-auto">
        <Button
          variant="captionAction"
          size="captionAction"
          disabled={!pagination.hasPrev}
          onClick={() => handlePageNavigate(pagination.page - 1)}
          aria-label={t("previous")}
          className="flex aspect-square h-11 w-11 shrink-0 items-center justify-center rounded-full p-0"
        >
          <ChevronLeft className="h-7 w-7 -translate-x-px" />
        </Button>

        {/* focus-within indicator preserves keyboard accessibility (Tab navigation) */}
        <div className="relative flex h-11 min-w-0 flex-1 items-center rounded-full focus-within:ring-2 focus-within:ring-secondary-light focus-within:ring-offset-1">
          {/* Custom Track: height h-2.5 (10px), pale grayish-blue background */}
          <div className="pointer-events-none relative h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80">
            {/* Progress fill width aligned precisely to dynamic thumb center, no transition lag */}
            <div className="h-full bg-secondary-light" style={{ width: thumbLeft }} />
          </div>

          {/* Custom Thumb: w-max + min-width: 2.75rem + px-3.5. 1-digit = strict circle, 2+ digits = natural capsule */}
          <div
            className="pointer-events-none absolute top-1/2 z-10 box-border flex h-11 w-max shrink-0 -translate-x-1/2 -translate-y-1/2 select-none items-center justify-center whitespace-nowrap rounded-full bg-secondary-light px-3.5 font-bold text-white text-xs shadow-md"
            style={{
              left: thumbLeft,
              height: "2.75rem",
              minWidth: "2.75rem",
            }}
          >
            {sliderValue}
          </div>

          {/* Transparent standard range input overlaid on top for native drag/touch/accessibility */}
          <input
            type="range"
            min={1}
            max={Math.max(1, pagination.totalPages)}
            value={sliderValue}
            onChange={(e) => setSliderValue(Number(e.target.value))}
            onMouseUp={(e) => handlePageNavigate(Number(e.currentTarget.value))}
            onPointerUp={(e) => handlePageNavigate(Number(e.currentTarget.value))}
            onPointerCancel={(e) => handlePageNavigate(Number(e.currentTarget.value))}
            onBlur={(e) => handlePageNavigate(Number(e.currentTarget.value))}
            onKeyUp={(e) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                  "PageUp",
                  "PageDown",
                  "Enter",
                  " ",
                ].includes(e.key)
              ) {
                handlePageNavigate(Number(e.currentTarget.value));
              }
            }}
            className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0 focus:outline-none"
            aria-label={t("page")}
            aria-valuenow={sliderValue}
            aria-valuemin={1}
            aria-valuemax={pagination.totalPages}
          />
        </div>

        <Button
          variant="captionAction"
          size="captionAction"
          disabled={!pagination.hasNext}
          onClick={() => handlePageNavigate(pagination.page + 1)}
          aria-label={t("next")}
          className="flex aspect-square h-11 w-11 shrink-0 items-center justify-center rounded-full p-0"
        >
          <ChevronRight className="h-7 w-7 translate-x-px" />
        </Button>
      </div>

      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        <span className="shrink-0 select-none whitespace-nowrap font-semibold text-secondary-light text-xs uppercase tracking-wider">
          {t("itemsPerPage")}
        </span>
        <Select value={pagination.limit.toString()} onValueChange={handleItemsPerPageChange}>
          <SelectTrigger
            className={cn(
              buttonVariants({ variant: "captionAction", size: "captionAction" }),
              "cursor-pointer gap-1.5 border-secondary-light pr-3 pl-4 font-semibold text-secondary-light text-xs transition-colors hover:bg-hover hover:text-secondary focus:outline-none focus:ring-0 focus:ring-offset-0 data-[state=open]:border-secondary data-[state=open]:bg-secondary data-[state=open]:text-white [&>svg]:size-4 [&>svg]:fill-current [&>svg]:text-current [&>svg]:opacity-100",
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="min-w-[5rem] rounded-xl border-none bg-white py-1.5 font-semibold text-sm shadow-lg">
            <SelectItem
              value="20"
              className="cursor-pointer px-5 py-2 font-semibold hover:bg-hover hover:text-secondary data-[state=checked]:font-bold data-[state=checked]:text-secondary"
            >
              20
            </SelectItem>
            <SelectItem
              value="50"
              className="cursor-pointer px-5 py-2 font-semibold hover:bg-hover hover:text-secondary data-[state=checked]:font-bold data-[state=checked]:text-secondary"
            >
              50
            </SelectItem>
            <SelectItem
              value="100"
              className="cursor-pointer px-5 py-2 font-semibold hover:bg-hover hover:text-secondary data-[state=checked]:font-bold data-[state=checked]:text-secondary"
            >
              100
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function PaginationLoadingSkeleton() {
  return (
    <div className="mt-4 flex w-full animate-pulse items-center justify-between gap-4 sm:flex-row">
      <div className="flex flex-1 items-center gap-3">
        <div className="h-11 w-11 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="h-11 w-11 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-9 w-16 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}
