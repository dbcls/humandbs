import { Skeleton } from "./ui/skeleton";

export function SkeletonLoading() {
  return (
    <div role="status" className="max-w-full min-w-sm animate-pulse space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
    </div>
  );
}
