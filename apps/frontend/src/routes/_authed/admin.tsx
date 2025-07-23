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
  QueryClient,
  useMutation,
  useQueries,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { useLocale, useTranslations } from "use-intl";
import { AssetsPanel } from "./-components/Assets";
import { TranslationDetails } from "./-components/TranslationDetails";
import {
  $createNewsItem,
  $deleteNewsTranslation,
  $updateNewsItem,
  $upsertNewsTranslation,
  getNewsItemsQueryOptions,
  GetNewsItemsResponse,
} from "@/serverFunctions/news";
import { NewsTranslationInsert } from "@/db/types";
import MDEditor from "@uiw/react-md-editor";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Trash2Icon } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";

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
    await $createNewsItem();
    queryClient.invalidateQueries(getNewsItemsQueryOptions({}));
  }

  return (
    <>
      <div className="bg-primary w-md rounded-md p-4">
        <Suspense fallback={<Skeleton />}>
          <ListOfNews
            onClickAdd={handleAddNewsItem}
            selectedNewsItem={selectedNewsItem}
            onSelectNewsItem={setSelectedNewsItem}
          />
        </Suspense>
      </div>
      <div className="bg-primary flex flex-1 flex-col gap-5 rounded-md p-4">
        <NewsEditor newsItem={selectedNewsItem} />
      </div>
    </>
  );
}

function NewsEditor({
  newsItem,
}: {
  newsItem: GetNewsItemsResponse[number] | undefined;
}) {
  const queryClient = useQueryClient();
  const [selectedLocale, setSelectedLocale] = useState<Locale>(
    i18n.defaultLocale
  );

  const translation = newsItem?.translations.find(
    (tr) => tr?.lang === selectedLocale
  );

  const [value, setValue] = useState(() => translation?.content);

  const [title, setTitle] = useState(() => translation?.title);

  const [publishedDate, setPublishedDate] = useState<Date>();

  useEffect(() => {
    setValue(
      newsItem?.translations?.find((tr) => tr?.lang === selectedLocale)?.content
    );
    setTitle(
      newsItem?.translations?.find((tr) => tr?.lang === selectedLocale)?.title
    );

    setPublishedDate(newsItem?.publishedAt ?? undefined);
  }, [newsItem, selectedLocale]);

  async function handleSave() {
    if (!newsItem) return;

    if (publishedDate) {
      await $updateNewsItem({
        data: {
          publishedAt: publishedDate,
          id: newsItem.id,
        },
      });
    }

    if (value && title) {
      await $upsertNewsTranslation({
        data: {
          title,
          content: value,
          lang: selectedLocale,
          newsId: newsItem.id,
        },
      });
    }

    queryClient.invalidateQueries(getNewsItemsQueryOptions({}));
  }

  async function handleDeleteTranslation() {
    if (!newsItem) return;
    if (!selectedLocale) return;

    await $deleteNewsTranslation({
      data: {
        newsId: newsItem.id,
        lang: selectedLocale,
      },
    });

    queryClient.invalidateQueries(getNewsItemsQueryOptions({}));
  }

  if (!newsItem) return null;

  return (
    <>
      <DatePicker
        label="Publication date"
        dateValue={publishedDate}
        onChangeDateValue={setPublishedDate}
      />
      <LocaleSwitcher
        locale={selectedLocale}
        onSwitchLocale={setSelectedLocale}
      />
      <div>
        <Label>Title</Label>
        <Input
          value={title ?? ""}
          className="bg-white"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex flex-1 flex-col">
        <Label className="mb-2">Content</Label>
        <div data-color-mode="light" className="flex-1">
          <MDEditor
            highlightEnable={true}
            value={value ?? ""}
            onChange={setValue}
            height="100%"
            className="md-editor flex-1"
            components={{
              preview: (source) => {
                const { content } = transformMarkdoc({ rawContent: source });

                return <RenderMarkdoc content={content} />;
              },
            }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Button onClick={handleDeleteTranslation} variant={"plain"}>
          <Trash2Icon className="text-red-600" />
        </Button>
        <Button size="lg" onClick={handleSave}>
          Update
        </Button>
      </div>
    </>
  );
}

function ListOfNews({
  onClickAdd,
  selectedNewsItem,
  onSelectNewsItem,
}: {
  onClickAdd: () => void;
  selectedNewsItem: GetNewsItemsResponse[number] | undefined;
  onSelectNewsItem: (item: GetNewsItemsResponse[number]) => void;
}) {
  const { data: newsItems } = useSuspenseQuery(getNewsItemsQueryOptions({}));

  const locale = useLocale();

  return (
    <ul>
      {newsItems.map((item) => {
        const title =
          item.translations.find((tr) => tr?.lang === locale)?.title ||
          item.translations[0]?.title ||
          "No title";
        return (
          <li key={item.id}>
            <Button
              size={"slim"}
              className={cn({
                "border-secondary-light border":
                  item.id === selectedNewsItem?.id,
              })}
              onClick={() => onSelectNewsItem(item)}
              variant={"toggle"}
            >
              <p className="text-xs">
                {item.publishedAt?.toLocaleDateString(locale) || "No data"}
                {item.translations.map((tr, index) => (
                  <span
                    className="bg-secondary-light ml-2 rounded-full px-2 text-xs text-white"
                    key={`${tr?.lang}-${index}`}
                  >
                    {tr?.lang}
                  </span>
                ))}
              </p>
              <p className="text-sm">{title}</p>
            </Button>
          </li>
        );
      })}
      <li>
        <Button onClick={onClickAdd} variant={"toggle"}>
          + Add news
        </Button>
      </li>
    </ul>
  );
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
    <div className="flex flex-col gap-3">
      <Label>Locale</Label>
      <ToggleGroup type="single" value={locale} onValueChange={onSwitchLocale}>
        {i18n.locales.map((loc) => (
          <ToggleGroupItem key={loc} value={loc}>
            {loc}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
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
