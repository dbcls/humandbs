import { Card } from "@/components/Card";
import { Skeleton } from "@/components/ui/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { ContentList } from "./-components/ContentList";
import { ContentItemDetails } from "./-components/ContentItemDetails";
import { FallbackDetailsCard } from "./-components/FallbackDetailsCard";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/content")(
  {
    component: RouteComponent,
  }
);

function RouteComponent() {
  const [selectedContentId, setSelectedContentId] = useState("");

  return (
    <>
      <Card className="w-cms-list-panel flex h-full flex-col" caption="Content">
        <Suspense fallback={<Skeleton />}>
          <ContentList
            onClickAdd={() => {}}
            selectedContentId={selectedContentId}
            onSelectContent={setSelectedContentId}
          />
        </Suspense>
      </Card>
      {selectedContentId && (
        <Suspense fallback={<FallbackDetailsCard />}>
          <ContentItemDetails key={selectedContentId} id={selectedContentId} />
        </Suspense>
      )}
    </>
  );
}
