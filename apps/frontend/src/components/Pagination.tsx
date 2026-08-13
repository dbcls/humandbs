import { useNavigate } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { useEffect, useState } from "react";

import type { Pagination as APIPagination } from "@humandbs/backend/types";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Export function for testing compatibility
export const getVisiblePages = (currentPage: number, totalPages: number) => {
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

  // Calculate dynamic thumb width: min 48px (perfect circle), expands as page digits grow
  const pageStr = String(sliderValue);
  const thumbWidth = Math.max(48, 32 + pageStr.length * 8);
  const thumbLeft = `calc(${percentage}% + ${(0.5 - percentage / 100) * thumbWidth}px)`;

  return (
    <div
      className={cn(
        "mt-4 flex flex-col items-center justify-between gap-4 sm:flex-row w-full",
        className
      )}
    >
      <div className="flex flex-1 items-center gap-3 w-full sm:w-auto">
        <Button
          variant="captionAction"
          disabled={!pagination.hasPrev}
          onClick={() => handlePageNavigate(pagination.page - 1)}
          aria-label={t("previous")}
          className="flex aspect-square h-12 w-12 items-center justify-center rounded-full p-0 shrink-0"
        >
          <ChevronLeft className="h-9 w-9 -translate-x-[1px]" />
        </Button>

        <div className="relative flex flex-1 items-center h-12 min-w-0">
          {/* Custom Track: height h-2.5 (10px), pale grayish-blue background */}
          <div className="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden relative pointer-events-none">
            {/* Progress fill width aligned precisely to dynamic thumb center */}
            <div
              className="h-full bg-secondary-light transition-all duration-75"
              style={{ width: thumbLeft }}
            />
          </div>

          {/* Custom Thumb: h-12 (48px), minimum 48px width (circle for <= 2 digits), expands for 3+ digits */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none z-10 flex h-12 items-center justify-center rounded-full bg-secondary-light text-white font-bold text-base shadow-md transition-all whitespace-nowrap px-3"
            style={{
              left: thumbLeft,
              minWidth: `${thumbWidth}px`,
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
              if (e.key === "Enter" || e.key === " ") handleSliderCommit();
            }}
            className="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer"
            aria-label={t("page")}
          />
        </div>

        <Button
          variant="captionAction"
          disabled={!pagination.hasNext}
          onClick={() => handlePageNavigate(pagination.page + 1)}
          aria-label={t("next")}
          className="flex aspect-square h-12 w-12 items-center justify-center rounded-full p-0 shrink-0"
        >
          <ChevronRight className="h-9 w-9 translate-x-[1px]" />
        </Button>
      </div>

      <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
        <span className="text-sm text-muted-foreground">{t("itemsPerPage")}:</span>
        <Select value={pagination.limit.toString()} onValueChange={handleItemsPerPageChange}>
          <SelectTrigger className="w-fit h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
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
        <div className="h-12 w-12 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
        <div className="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="h-12 w-12 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
      </div>
      <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
        <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-9 w-16 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}
