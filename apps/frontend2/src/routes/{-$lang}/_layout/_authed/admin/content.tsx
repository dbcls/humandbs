import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";

import { Card } from "@/components/Card";
import { Skeleton } from "@/components/ui/skeleton";

import { ContentItemDetails } from "./-components/ContentItemDetails";
import { ContentList } from "./-components/ContentList";
import { FallbackDetailsCard } from "./-components/FallbackDetailsCard";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/content")(
  {
    component: RouteComponent,
  }
);

function RouteComponent() {
  const [selectedContentId, setSelectedContentId] = useState<string | null>(
    null
  );

  return (
    <>
      <Card className="w-cms-list-panel flex h-full flex-col" caption="Content">
        <p className="mb-5 text-sm">"Oprhan pages" list</p>
        <Suspense fallback={<Skeleton />}>
          <ContentList
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
