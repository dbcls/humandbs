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

  return (
    <div
      className={cn(
        "mt-4 flex flex-col items-center justify-between gap-4 sm:flex-row w-full",
        className
      )}
    >
      <div className="flex flex-1 items-center gap-3 w-full sm:w-auto">
        <Button
          variant="outline"
          size="icon"
          disabled={!pagination.hasPrev}
          onClick={() => handlePageNavigate(pagination.page - 1)}
          aria-label={t("previous")}
          className="h-9 w-9 shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex flex-1 items-center gap-3">
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
            className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-secondary accent-primary"
            aria-label={t("page")}
          />
          <span className="text-sm font-medium whitespace-nowrap text-muted-foreground min-w-[3.5rem] text-center">
            {sliderValue} / {pagination.totalPages}
          </span>
        </div>

        <Button
          variant="outline"
          size="icon"
          disabled={!pagination.hasNext}
          onClick={() => handlePageNavigate(pagination.page + 1)}
          aria-label={t("next")}
          className="h-9 w-9 shrink-0"
        >
          <ChevronRight className="h-4 w-4" />
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
        <div className="h-9 w-9 rounded-md bg-gray-200 dark:bg-gray-700 shrink-0" />
        <div className="h-2 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-12 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-9 w-9 rounded-md bg-gray-200 dark:bg-gray-700 shrink-0" />
      </div>
      <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
        <div className="h-4 w-16 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-9 w-16 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}
