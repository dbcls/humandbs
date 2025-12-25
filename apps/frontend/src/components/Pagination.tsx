import { useNavigate } from "@tanstack/react-router";
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
  totalPages: number;
  page: number;
  itemsPerPage?: number;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
}

export function Pagination({
  totalPages,
  page,
  itemsPerPage = 20,
  onItemsPerPageChange,
}: PaginationProps) {
  const navigate = useNavigate();

  const visiblePages = getVisiblePages(page, totalPages);

  const handleItemsPerPageChange = (value: string) => {
    const newItemsPerPage = parseInt(value);
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

  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-4 sm:flex-row">
      <PaginationBase>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              to="."
              search={(prev) => ({
                ...prev,
                page: Math.max(1, page - 1),
              })}
              className={page === 1 ? "pointer-events-none opacity-50" : ""}
              resetScroll={false}
            />
          </PaginationItem>

          {visiblePages.map((pageNum, index) => {
            if (pageNum === "ellipsis") {
              return (
                <PaginationItem key={`ellipsis-${pageNum}-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              );
            }

            return (
              <PaginationItem key={pageNum}>
                <PaginationLink
                  to="."
                  search={(prev) => ({ ...prev, page: pageNum })}
                  isActive={pageNum === page}
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
                page: Math.min(totalPages, page + 1),
              })}
              className={
                page === totalPages ? "pointer-events-none opacity-50" : ""
              }
              resetScroll={false}
            />
          </PaginationItem>
        </PaginationContent>
      </PaginationBase>

      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-muted-foreground text-sm">Items per page:</span>
        <Select
          value={itemsPerPage.toString()}
          onValueChange={handleItemsPerPageChange}
        >
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
