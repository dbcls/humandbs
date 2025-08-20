import { Card } from "@/components/Card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentVersion, UserRole } from "@/db/schema";
import { i18n, Locale } from "@/lib/i18n-config";
import { roles } from "@/lib/permissions";
import {
  $createNewsItem,
  getNewsItemsQueryOptions,
  GetNewsItemsResponse,
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
import { DocumentVersionListItemResponse } from "@/serverFunctions/documentVersion";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertsList } from "./-components/AlertsList";
import { AlertContent } from "./-components/AlertContent";
import {
  getAlertsQueryOptions,
  GetAlertsResponse,
  $createAlert,
} from "@/serverFunctions/alert";
import { useRouteContext } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/admin")({
  component: RouteComponent,
});

type MainTab = "news" | "documents" | "users" | "alerts";

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
        <ToggleGroupItem value="alerts">Alerts</ToggleGroupItem>
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
      <TabsContent className="flex items-stretch gap-2" value="alerts">
        <ManageAlerts />
      </TabsContent>
    </Tabs>
  );
}

function ManageNews() {
  const queryClient = useQueryClient();
  const [selectedNewsItem, setSelectedNewsItem] =
    useState<GetNewsItemsResponse[number]>();

  async function handleAddNewsItem() {
    await $createNewsItem({ data: {} });
    queryClient.invalidateQueries(getNewsItemsQueryOptions({ limit: 100 }));
  }

  return (
    <>
      <div className="bg-primary w-md rounded-md p-4">
        <Suspense fallback={<Skeleton />}>
          <NewsItemsList
            onClickAdd={handleAddNewsItem}
            selectedNewsItem={selectedNewsItem}
            onSelectNewsItem={setSelectedNewsItem}
          />
        </Suspense>
      </div>
      <div className="bg-primary flex flex-1 flex-col gap-5 rounded-md p-4">
        <NewsItemContent newsItem={selectedNewsItem} />
      </div>
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
        captionSize={"sm"}
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
          <Card className="w-80" captionSize={"sm"} caption="Versions">
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

function ManageAlerts() {
  const queryClient = useQueryClient();
  const { user } = useRouteContext({ from: "__root__" });
  const [selectedAlert, setSelectedAlert] =
    useState<GetAlertsResponse[number]>();

  async function handleAddAlert() {
    if (!user?.id) {
      alert("Please log in to create alerts");
      return;
    }

    await $createAlert({
      data: {
        authorId: user.id,
        translations: [],
      },
    });
    queryClient.invalidateQueries(getAlertsQueryOptions({ limit: 100 }));
  }

  return (
    <>
      <Suspense fallback={<Skeleton />}>
        <AlertsList
          onClickAdd={handleAddAlert}
          selectedAlert={selectedAlert}
          onSelectAlert={setSelectedAlert}
        />
      </Suspense>

      <AlertContent alert={selectedAlert} />
    </>
  );
}
