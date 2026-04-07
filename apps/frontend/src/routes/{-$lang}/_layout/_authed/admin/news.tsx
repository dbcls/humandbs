import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { isDraftNewsItem } from "./-components/-draftNewsItem";
import { NewsItemContent } from "./-components/NewsItemContent";
import { NewsItemsList } from "./-components/NewsItemsList";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/news")({
  component: RouteComponent,
});

function RouteComponent() {
  const [selectedNewsItemId, setSelectedNewsItemId] = useState<
    string | undefined
  >();

  return (
    <>
      <Suspense fallback={<Skeleton />}>
        <NewsItemsList
          selectedNewsItemId={selectedNewsItemId}
          onSelectNewsItem={setSelectedNewsItemId}
        />
      </Suspense>

      {selectedNewsItemId ? (
        <NewsItemContent
          key={selectedNewsItemId}
          selectedNewsItemId={selectedNewsItemId}
        />
      ) : null}
    </>
  );
}
