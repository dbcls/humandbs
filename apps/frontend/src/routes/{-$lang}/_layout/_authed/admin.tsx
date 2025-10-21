import { Card } from "@/components/Card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UserRole } from "@/db/schema";
import { roles } from "@/lib/permissions";
import { DocumentVersionListItemResponse } from "@/serverFunctions/documentVersion";
import {
  $createNewsItem,
  getNewsItemsQueryOptions,
  NewsItemResponse,
} from "@/serverFunctions/news";
import { $changeUserRole, getUsersQueryOptions } from "@/serverFunctions/user";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { AssetsPanel } from "./-components/Assets";
import { ContentList } from "./-components/ContentList";
import { DocumentsList } from "./-components/DocumentsList";
import { DocumentVersionContent } from "./-components/DocumentVersionContent";
import { DocumentVersionsList } from "./-components/DocumentVersionsList";
import { NewsItemContent } from "./-components/NewsItemContent";
import { NewsItemsList } from "./-components/NewsItemsList";
import { ContentItemDetails } from "./-components/ContentItemDetails";
import { FallbackDetailsCard } from "./-components/FallbackDetailsCard";
import z from "zod";

const tabSearchParamSchema = z.enum(["news", "documents", "content", "users"]);

type MainTab = z.infer<typeof tabSearchParamSchema>;

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin")({
  component: RouteComponent,
  validateSearch: z.object({ tab: tabSearchParamSchema.default("news") }),
});

function RouteComponent() {
  const { tab: selectedTab } = Route.useSearch();

  const navigate = Route.useNavigate();

  return (
    <Tabs value={selectedTab} className="flex-1">
      <ToggleGroup
        type="single"
        value={selectedTab}
        onValueChange={(value) =>
          value && navigate({ search: { tab: value as MainTab } })
        }
      >
        <ToggleGroupItem value="news">News</ToggleGroupItem>
        <ToggleGroupItem value="documents">Documents</ToggleGroupItem>
        <ToggleGroupItem value="content">Content</ToggleGroupItem>
        <ToggleGroupItem value="users">Users</ToggleGroupItem>
      </ToggleGroup>
      <TabsContent className="flex items-stretch gap-2" value="news">
        <AssetsPanel />
        <ManageNews />
      </TabsContent>
      <TabsContent className="flex items-stretch gap-2" value="documents">
        <AssetsPanel />
        <ManageDocuments />
      </TabsContent>
      <TabsContent className="flex items-stretch gap-2" value="content">
        <AssetsPanel />
        <ManageContent />
      </TabsContent>
      <TabsContent value="users">
        <Suspense fallback={<div>Loading...</div>}>
          <ManageUsers />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}

function ManageNews() {
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

function ManageDocuments() {
  const [selectedContentId, setSelectedContentId] = useState<string>();

  const [selectedVersion, setSelectedVersion] =
    useState<DocumentVersionListItemResponse | null>(null);

  function handleSelectDoc(contentId: string) {
    if (selectedContentId !== contentId) {
      setSelectedVersion(null);
    }
    setSelectedContentId(contentId);
  }

  return (
    <>
      <Card
        className="w-cms-list-panel flex h-full flex-col"
        caption="Documents"
        containerClassName="overflow-auto flex-1 max-h-full"
      >
        <Suspense fallback={<Skeleton />}>
          <DocumentsList
            onSelectDoc={handleSelectDoc}
            selectedContentId={selectedContentId}
          />
        </Suspense>
      </Card>

      {selectedContentId ? (
        <>
          <Card className="w-80" caption="Versions">
            <Suspense
              fallback={
                <div>
                  <Skeleton />
                </div>
              }
            >
              <DocumentVersionsList
                contentId={selectedContentId}
                onSelect={setSelectedVersion}
              />
            </Suspense>
          </Card>
          {selectedVersion?.versionNumber ? (
            <DocumentVersionContent
              key={selectedVersion.contentId + selectedVersion.versionNumber}
              documentVersionItem={selectedVersion}
            />
          ) : (
            <Card className="flex-1" captionSize={"sm"} caption="Details">
              Select a version
            </Card>
          )}
        </>
      ) : (
        <div> No document selected </div>
      )}
    </>
  );
}

function ManageContent() {
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

function ManageUsers() {
  const queryClient = useQueryClient();
  const { data: users } = useSuspenseQuery(getUsersQueryOptions());

  const { mutate: changeRole } = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      $changeUserRole({ data: { id, role } }),
    onSuccess: () => {
      queryClient.invalidateQueries(getUsersQueryOptions());
    },
  });

  return (
    <ul className="bg-primary space-y-1 p-2">
      {users.map((user) => (
        <li className="flex justify-between" key={user.id}>
          <span>{user.name}</span>
          <Select
            onValueChange={(value) =>
              changeRole({ id: user.id, role: value as UserRole })
            }
            value={user.role || undefined}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </li>
      ))}
    </ul>
  );
}
