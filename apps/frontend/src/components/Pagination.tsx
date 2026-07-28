import { useNavigate } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { useEffect, useState } from "react";

import type { Pagination as APIPagination } from "@humandbs/backend/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Pagination as PaginationBase,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Export function for testing
export const getVisiblePages = (currentPage: number, totalPages: number) => {
  const pages: (number | "ellipsis")[] = [];

  if (totalPages <= 7) {
    // If total pages is small, show all pages
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  // Always show first page
  pages.push(1);

  if (currentPage <= 3) {
    // Current page is close to beginning
    if (currentPage === 3) {
      // Show [1] [2] [3] [4] ... [X]
      pages.push(2, 3, 4);
    } else {
      // Show [1] [2] [3] ... [X] for currentPage 1 or 2
      pages.push(2, 3);
    }
    pages.push("ellipsis");
  } else if (currentPage >= totalPages - 2) {
    // Current page is close to end
    pages.push("ellipsis");
    if (currentPage === totalPages - 2) {
      // Show [1] ... [X-3] [X-2] [X-1] [X]
      for (let i = totalPages - 3; i <= totalPages - 1; i++) {
        pages.push(i);
      }
    } else {
      // Show [1] ... [X-2] [X-1] [X] for currentPage X-1 or X
      for (let i = totalPages - 2; i <= totalPages - 1; i++) {
        pages.push(i);
      }
    }
  } else {
    // Current page is in the middle - general form
    pages.push("ellipsis");
    for (let i = currentPage - 1; i <= currentPage + 1; i++) {
      pages.push(i);
    }
    pages.push("ellipsis");
  }

  // Always show last page (if it's not already included)
  if (totalPages > 1) {
    pages.push(totalPages);
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
  const [pageInput, setPageInput] = useState(String(pagination.page));

  const visiblePages = getVisiblePages(pagination.page, pagination.totalPages);
  const visiblePageItems = visiblePages.map((pageNum, index) => ({
    pageNum,
    key:
      pageNum === "ellipsis"
        ? `ellipsis-${visiblePages[index - 1]}-${visiblePages[index + 1]}`
        : pageNum,
  }));

  useEffect(() => {
    setPageInput(String(pagination.page));
  }, [pagination.page]);

  const handleItemsPerPageChange = (value: string) => {
    const newItemsPerPage = parseInt(value, 10);
    if (onItemsPerPageChange) {
      onItemsPerPageChange(newItemsPerPage);
    }
    // Navigate to page 1 when changing items per page
    navigate({
      to: ".",
      search: (prev) => ({ ...prev, page: 1, limit: newItemsPerPage }),
      resetScroll: false,
    });
  };

  const handlePageJump = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const requestedPage = Number(pageInput);
    if (!Number.isInteger(requestedPage)) return;

    const page = Math.min(pagination.totalPages, Math.max(1, requestedPage));
    setPageInput(String(page));

    if (page === pagination.page) return;

    navigate({
      to: ".",
      search: (prev) => ({ ...prev, page }),
      resetScroll: false,
    });
  };

  return (
    <div
      className={cn("mt-4 flex flex-col items-center justify-between gap-4 sm:flex-row", className)}
    >
      <PaginationBase>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              to="."
              search={(prev) => ({
                ...prev,
                page: Math.max(1, pagination.page - 1),
              })}
              label={t("previous")}
              className={cn({
                "pointer-events-none opacity-50": !pagination.hasPrev,
              })}
              resetScroll={false}
            />
          </PaginationItem>

          {visiblePageItems.map(({ pageNum, key }) => {
            if (pageNum === "ellipsis") {
              return (
                <PaginationItem key={key}>
                  <PaginationEllipsis />
                </PaginationItem>
              );
            }

            return (
              <PaginationItem key={pageNum}>
                <PaginationLink
                  to="."
                  search={(prev) => ({ ...prev, page: pageNum })}
                  isActive={pageNum === pagination.page}
                  resetScroll={false}
                >
                  {pageNum}
                </PaginationLink>
              </PaginationItem>
            );
          })}

          <PaginationItem>
            <PaginationNext
              to="."
              search={(prev) => ({
                ...prev,
                page: Math.min(pagination.totalPages, pagination.page + 1),
              })}
              label={t("next")}
              className={cn({
                "pointer-events-none opacity-50": !pagination.hasNext,
              })}
              resetScroll={false}
            />
          </PaginationItem>
          <PaginationItem>
            <form className="flex items-center gap-2" onSubmit={handlePageJump}>
              <label className="text-muted-foreground text-sm" htmlFor="pagination-page">
                {t("page")}
              </label>
              <Input
                aria-label={t("pageNumber")}
                className="w-24 text-center"
                id="pagination-page"
                max={pagination.totalPages}
                min="1"
                onChange={(event) => setPageInput(event.target.value)}
                required
                step="1"
                type="number"
                value={pageInput}
              />
              <Button size="default" type="submit" variant="outline">
                {t("go")}
              </Button>
            </form>
          </PaginationItem>
        </PaginationContent>
      </PaginationBase>

      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-muted-foreground text-sm">{t("itemsPerPage")}:</span>
        <Select value={pagination.limit.toString()} onValueChange={handleItemsPerPageChange}>
          <SelectTrigger className="w-fit">
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
    <div className="mt-4 flex animate-pulse items-center justify-between gap-4 sm:flex-row">
      <div className="h-8 w-24 rounded bg-gray-300" />
      <div className="flex items-center gap-2 whitespace-nowrap">
        <div className="h-5 w-20 rounded bg-gray-300" />
        <div className="h-8 w-16 rounded bg-gray-300" />
      </div>
    </div>
  );
}
