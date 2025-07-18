import { Button } from "@/components/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UserRole } from "@/db/schema";
import { i18n, Locale } from "@/lib/i18n-config";
import { roles } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { getDocumentsQueryOptions } from "@/serverFunctions/document";
import {
  $createDocumentVersion,
  getDocumentVersionsListQueryOptions,
} from "@/serverFunctions/documentVersion";
import { $changeUserRole, getUsersQueryOptions } from "@/serverFunctions/user";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { useTranslations } from "use-intl";
import { AssetsPanel } from "./-components/Assets";
import { TranslationDetails } from "./-components/TranslationDetails";

export const Route = createFileRoute("/_authed/admin")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Tabs defaultValue="news" className="z-50 flex-1">
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
  const [selectedNewsId, setSelectedNewsId] = useState<string>();

  const [selectedLocale, setSelectedLocale] = useState<Locale>(
    i18n.defaultLocale
  );

  return (
    <Suspense fallback={<Skeleton />}>
      <ListOfNews />
    </Suspense>
  );
}

function ListOfNews() {
  return <ul></ul>;
}

function ManageDocuments() {
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>();

  const [selectedLocale, setSelectedLocale] = useState<Locale>(
    i18n.defaultLocale
  );

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null
  );

  function handleSelectDoc(docId: string) {
    setSelectedDocumentId(docId);
    setSelectedVersionId(null);
  }

  return (
    <>
      <div className="bg-primary w-md rounded-md p-4">
        <Suspense fallback={<Skeleton />}>
          <DocumentsList
            onSelectDoc={handleSelectDoc}
            selectedDocId={selectedDocumentId}
          />
        </Suspense>
      </div>

      {selectedDocumentId ? (
        <>
          <div className="bg-primary rounded-sm p-2">
            <Suspense
              fallback={
                <div>
                  <Skeleton />
                  <Button variant={"action"} disabled>
                    Add new
                  </Button>
                </div>
              }
            >
              <ListOfVersions
                selectedVersionId={selectedVersionId}
                onSelect={setSelectedVersionId}
                documentId={selectedDocumentId}
              />
            </Suspense>
          </div>
          {selectedVersionId ? (
            <div className="flex-1 rounded-sm bg-white p-4">
              <LocaleSwitcher
                locale={selectedLocale}
                onSwitchLocale={setSelectedLocale}
              />
              <Suspense fallback={<Skeleton />}>
                <TranslationDetails
                  locale={selectedLocale}
                  documentVersionId={selectedVersionId}
                />
              </Suspense>
            </div>
          ) : (
            <div>Select a version</div>
          )}
        </>
      ) : (
        <div> No document selected </div>
      )}
    </>
  );
}

function DocumentsList({
  onSelectDoc,
  selectedDocId,
}: {
  onSelectDoc: (id: string) => void;
  selectedDocId: string | undefined;
}) {
  const { data: documents } = useSuspenseQuery(getDocumentsQueryOptions());

  const t = useTranslations("Navbar");

  return (
    <ul className="space-y-4">
      {documents.map((doc) => (
        <li key={doc.id}>
          <Button
            className={cn({
              "border-secondary-light border": doc.id === selectedDocId,
            })}
            onClick={() => onSelectDoc(doc.id)}
            variant={"toggle"}
          >
            {t(doc.contentId as any)}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function LocaleSwitcher({
  locale,
  onSwitchLocale,
}: {
  locale: Locale;
  onSwitchLocale: (locale: Locale) => void;
}) {
  return (
    <ToggleGroup type="single" value={locale} onValueChange={onSwitchLocale}>
      {i18n.locales.map((loc) => (
        <ToggleGroupItem key={loc} value={loc}>
          {loc}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function ListOfVersions({
  documentId,
  onSelect,
  selectedVersionId,
}: {
  documentId: string;
  onSelect?: (id: string) => void;
  selectedVersionId: string | null;
}) {
  const queryClient = useQueryClient();

  const documentVersionsListQO = getDocumentVersionsListQueryOptions({
    documentId,
  });

  const { data: versions } = useSuspenseQuery(documentVersionsListQO);

  async function handleAddNewVersion() {
    await $createDocumentVersion({ data: { documentId } });

    await queryClient.invalidateQueries(documentVersionsListQO);
  }

  return (
    <ul className="space-y-2">
      {versions.map((v) => (
        <li key={v.id}>
          <Button
            className={cn({
              "border-secondary-light border": selectedVersionId === v.id,
            })}
            variant={"toggle"}
            onClick={() => onSelect?.(v.id)}
          >
            {v.versionNumber}
          </Button>
        </li>
      ))}
      <li>
        <Button variant={"action"} onClick={handleAddNewVersion}>
          Add new
        </Button>
      </li>
    </ul>
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
