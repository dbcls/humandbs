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
import { DocumentVersionsList } from "./-components/DocumentVersionsList";
import { DocumentVersionTranslation } from "./-components/DocumentVersionTranslation";
import { NewsItemContent } from "./-components/NewsItemContent";
import { NewsItemsList } from "./-components/NewsItemsList";

export const Route = createFileRoute("/_authed/admin")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Tabs defaultValue="news" className="flex-1">
      <TabsList>
        <TabsTrigger value="news">News</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="users">Users</TabsTrigger>
      </TabsList>
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
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>();

  const [selectedLocale, setSelectedLocale] = useState<Locale>(
    i18n.defaultLocale
  );

  const [selectedVersion, setSelectedVersion] =
    useState<DocumentVersion | null>(null);

  function handleSelectDoc(docId: string) {
    setSelectedDocumentId(docId);
    setSelectedVersion(null);
  }

  return (
    <>
      <Card className="w-96" captionSize={"sm"} caption="Documents">
        <Suspense fallback={<Skeleton />}>
          <DocumentsList
            onSelectDoc={handleSelectDoc}
            selectedDocId={selectedDocumentId}
          />
        </Suspense>
      </Card>

      {selectedDocumentId ? (
        <>
          <Card className="w-64" captionSize={"sm"} caption="Versions">
            <Suspense
              fallback={
                <div>
                  <Skeleton />
                </div>
              }
            >
              <DocumentVersionsList
                selectedVersionId={selectedVersion?.id}
                onSelect={setSelectedVersion}
                documentId={selectedDocumentId}
              />
            </Suspense>
          </Card>
          {selectedVersion ? (
            <Suspense fallback={<Skeleton />}>
              <DocumentVersionTranslation
                locale={selectedLocale}
                documentVersion={selectedVersion}
              />
            </Suspense>
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
