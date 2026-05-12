import { Card } from "@/components/Card";
import { SkeletonLoading } from "@/components/Skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export function FallbackDetailsCard() {
  return (
    <Card
      className="flex h-full flex-1 flex-col"
      containerClassName="flex flex-col flex-1"
      captionSize={"sm"}
      caption={
        <span className="flex items-center gap-5">
          <Skeleton className="h-8 w-36" />

          <Skeleton className="h-8 w-48" />
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-end gap-2">
          <Skeleton className="h-16 w-36" />
          <Skeleton className="h-16 w-36" />
        </div>
        <SkeletonLoading />
      </div>
    </Card>
  );
}
