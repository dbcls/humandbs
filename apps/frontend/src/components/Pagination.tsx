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

export function Pagination({
  totalPages,
  page,
}: {
  totalPages: number;
  page: number;
}) {
  const navigate = useNavigate();

  return (
    <div className="mt-4 flex justify-center gap-5">
      <button
        className="btn btn-sm btn-outline"
        onClick={() =>
          navigate({ to: ".", search: (prev) => ({ page: prev.page! - 1 }) })
        }
        disabled={page === 1}
      >
        Previous
      </button>
      <span>
        {page} / {totalPages}
      </span>
      <button
        className="btn btn-sm btn-outline"
        onClick={() =>
          navigate({ to: ".", search: (prev) => ({ page: prev.page! + 1 }) })
        }
        disabled={page === totalPages}
      >
        Next
      </button>
    </div>
  );
}
