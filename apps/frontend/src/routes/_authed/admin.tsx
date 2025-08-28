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
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { AssetsPanel } from "./-components/Assets";
import { DocumentsList } from "./-components/DocumentsList";
import { DocumentVersionContent } from "./-components/DocumentVersionContent";
import { DocumentVersionsList } from "./-components/DocumentVersionsList";
import { NewsItemContent } from "./-components/NewsItemContent";
import { NewsItemsList } from "./-components/NewsItemsList";

export const Route = createFileRoute("/_authed/admin")({
  component: RouteComponent,
});

type MainTab = "news" | "documents" | "users";

function RouteComponent() {
  const [selectedTab, setSelectedTab] = useState<MainTab>("news");
  return (
    <Tabs value={selectedTab} className="flex-1">
      <ToggleGroup
        type="single"
        value={selectedTab}
        onValueChange={(value) => setSelectedTab(value as MainTab)}
      >
        <ToggleGroupItem value="news">News</ToggleGroupItem>
        <ToggleGroupItem value="documents">Documents</ToggleGroupItem>
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

      <NewsItemContent newsItem={selectedNewsItem} />
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
        className="flex h-full w-96 flex-col"
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
            <Card className="flex-1" captionSize={"sm"} caption="Content">
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
