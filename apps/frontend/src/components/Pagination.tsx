import { useNavigate } from "@tanstack/react-router";
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
import { ChevronLeft, ChevronRight } from "lucide-react";

// Export function for testing compatibility (_currentPage marked intentionally unused)
export const getVisiblePages = (_currentPage: number, totalPages: number) => {
  const pages: (number | "ellipsis")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    pages.push(i);
  }
  return pages;
};

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

  const handleSliderCommit = () => {
    handlePageNavigate(sliderValue);
  };

  const percentage =
    pagination.totalPages > 1
      ? ((sliderValue - 1) / (pagination.totalPages - 1)) * 100
      : 0;

  // Root base font-size is 10px (62.5%), so 2.75rem = exactly 27.5px.
  // Using w-max (width: max-content) + min-width: 2.75rem + px-3.5:
  // 1-digit fits comfortably inside 2.75rem min-width -> perfect 27.5px x 27.5px circle!
  // 2+ digits naturally exceed 2.75rem min-width with px-3.5 padding -> smoothly expands into capsule shape!
  const pageStr = String(sliderValue);
  const thumbWidthRem = Math.max(2.75, 1.5 + pageStr.length * 0.75);
  const thumbLeft = `calc(${percentage}% + ${(0.5 - percentage / 100)} * ${thumbWidthRem}rem)`;

  return (
    <div
      className={cn(
        "mt-4 flex flex-col items-center justify-between gap-6 sm:flex-row sm:gap-10 w-full",
        className
      )}
    >
      <div className="flex flex-1 items-center gap-3 w-full sm:w-auto">
        <Button
          variant="captionAction"
          size="captionAction"
          disabled={!pagination.hasPrev}
          onClick={() => handlePageNavigate(pagination.page - 1)}
          aria-label={t("previous")}
          className="flex aspect-square h-11 w-11 items-center justify-center rounded-full p-0 shrink-0"
        >
          <ChevronLeft className="h-7 w-7 -translate-x-[1px]" />
        </Button>

        {/* focus-within indicator preserves keyboard accessibility (Tab navigation) */}
        <div className="relative flex flex-1 items-center h-11 min-w-0 rounded-full focus-within:ring-2 focus-within:ring-secondary-light focus-within:ring-offset-1">
          {/* Custom Track: height h-2.5 (10px), pale grayish-blue background */}
          <div className="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden relative pointer-events-none">
            {/* Progress fill width aligned precisely to dynamic thumb center, no transition lag */}
            <div
              className="h-full bg-secondary-light"
              style={{ width: thumbLeft }}
            />
          </div>

          {/* Custom Thumb: w-max + min-width: 2.75rem + px-3.5. 1-digit = strict circle, 2+ digits = natural capsule */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none z-10 flex h-11 w-max items-center justify-center rounded-full bg-secondary-light text-white font-bold text-xs shadow-md whitespace-nowrap box-border shrink-0 select-none px-3.5"
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
            onMouseUp={handleSliderCommit}
            onTouchEnd={handleSliderCommit}
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
                handleSliderCommit();
              }
            }}
            className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer focus:outline-none"
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
          className="flex aspect-square h-11 w-11 items-center justify-center rounded-full p-0 shrink-0"
        >
          <ChevronRight className="h-7 w-7 translate-x-[1px]" />
        </Button>
      </div>

      <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
        <span className="shrink-0 select-none whitespace-nowrap font-semibold text-secondary-light text-xs uppercase tracking-wider">
          {t("itemsPerPage")}
        </span>
        <Select value={pagination.limit.toString()} onValueChange={handleItemsPerPageChange}>
          <SelectTrigger
            className={cn(
              buttonVariants({ variant: "captionAction", size: "captionAction" }),
              "cursor-pointer font-semibold text-xs text-secondary-light hover:bg-hover hover:text-secondary border-secondary-light gap-1.5 pl-4 pr-3 focus:ring-0 focus:ring-offset-0 focus:outline-none [&>svg]:fill-current [&>svg]:size-4 [&>svg]:text-secondary-light [&>svg]:opacity-100"
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl border border-secondary-light bg-white py-1.5 shadow-lg font-semibold text-xs min-w-[5rem]">
            <SelectItem value="20" className="px-4 py-2 hover:bg-hover hover:text-secondary cursor-pointer font-semibold">20</SelectItem>
            <SelectItem value="50" className="px-4 py-2 hover:bg-hover hover:text-secondary cursor-pointer font-semibold">50</SelectItem>
            <SelectItem value="100" className="px-4 py-2 hover:bg-hover hover:text-secondary cursor-pointer font-semibold">100</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function PaginationLoadingSkeleton() {
  return (
    <div className="mt-4 flex animate-pulse items-center justify-between gap-4 sm:flex-row w-full">
      <div className="flex flex-1 items-center gap-3">
        <div className="h-11 w-11 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
        <div className="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="h-11 w-11 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
      </div>
      <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
        <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-9 w-16 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}
