import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRouteContext } from "@tanstack/react-router";
import { Suspense, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  getNewsItemsQueryOptions,
  type NewsItemResponse,
} from "@/serverFunctions/news";

import {
  createDraftNewsItem,
  isDraftNewsItem,
} from "./-draftNewsItem";
import { NewsItemContent } from "./-components/NewsItemContent";
import { NewsItemsList } from "./-components/NewsItemsList";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/news")({
  component: RouteComponent,
});

function RouteComponent() {
  const queryClient = useQueryClient();
  const { user } = useRouteContext({ from: "__root__" });

  const [selectedNewsItem, setSelectedNewsItem] = useState<NewsItemResponse>();
  const [draftNewsItem, setDraftNewsItem] = useState<NewsItemResponse | null>(null);

  function handleAddNewsItem() {
    if (draftNewsItem) {
      setSelectedNewsItem(draftNewsItem);
      return;
    }
    const draft = createDraftNewsItem({
      name: user?.name ?? null,
      email: user?.email ?? "",
    });
    setDraftNewsItem(draft);
    setSelectedNewsItem(draft);
  }

  function handleDiscardDraft() {
    setDraftNewsItem(null);
    if (selectedNewsItem && isDraftNewsItem(selectedNewsItem.id)) {
      setSelectedNewsItem(undefined);
    }
  }

  function handleSelectNewsItem(item: NewsItemResponse) {
    setSelectedNewsItem(item);
  }

  return (
    <>
      <Suspense fallback={<Skeleton />}>
        <NewsItemsList
          onClickAdd={handleAddNewsItem}
          selectedNewsItem={selectedNewsItem}
          onSelectNewsItem={handleSelectNewsItem}
          draftNewsItem={draftNewsItem}
          onDiscardDraft={handleDiscardDraft}
        />
      </Suspense>

      <NewsItemContent
        key={selectedNewsItem?.id}
        newsItem={selectedNewsItem}
        mode={selectedNewsItem && isDraftNewsItem(selectedNewsItem.id) ? "create" : "update"}
        onCreateSuccess={(newItem) => {
          setDraftNewsItem(null);
          queryClient.invalidateQueries(
            getNewsItemsQueryOptions({ limit: 100 }),
          ).then(() => {
            setSelectedNewsItem(newItem);
          });
        }}
      />
    </>
  );
}
