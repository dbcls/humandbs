import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  $createNewsItem,
  getNewsItemsQueryOptions,
  NewsItemResponse,
} from "@/serverFunctions/news";

import { NewsItemContent } from "./-components/NewsItemContent";
import { NewsItemsList } from "./-components/NewsItemsList";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/news")({
  component: RouteComponent,
});

function RouteComponent() {
  const queryClient = useQueryClient();

  const [selectedNewsItem, setSelectedNewsItem] = useState<NewsItemResponse>();

  async function handleAddNewsItem() {
    await $createNewsItem({});
    queryClient.invalidateQueries(getNewsItemsQueryOptions({ limit: 100 }));
  }

  return (
    <>
      <Suspense fallback={<Skeleton />}>
        <NewsItemsList
          onClickAdd={handleAddNewsItem}
          selectedNewsItem={selectedNewsItem}
          onSelectNewsItem={setSelectedNewsItem}
        />
      </Suspense>

      <NewsItemContent key={selectedNewsItem?.id} newsItem={selectedNewsItem} />
    </>
  );
}
