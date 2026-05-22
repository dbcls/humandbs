import { Skeleton } from "./ui/skeleton";

export function SkeletonLoading() {
  return (
    <div role="status" className="min-w-sm max-w-full animate-pulse space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
    </div>
  );
}

export function SkeletonLoadingPanelItems() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}
