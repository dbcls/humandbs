import { Button } from "@/components/Button";
import { Skeleton } from "@/components/Skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UserRole } from "@/db/schema";
import { i18n, Locale } from "@/lib/i18n-config";
import { roles } from "@/lib/permissions";
import { useCopyToClipboard } from "@/lib/useColyToClipboard";
import { cn } from "@/lib/utils";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import {
  $deleteAsset,
  $uploadAsset,
  listAssetsQueryOptions,
} from "@/serverFunctions/assets";
import {
  $getDocuments,
  getDocumentsQueryOptions,
} from "@/serverFunctions/document";
import {
  $createDocumentVersion,
  getDocumentVersionsListQueryOptions,
} from "@/serverFunctions/documentVersion";
import {
  $createDocumentVersionTranslation,
  $deleteDocumentVersionTranslation,
  $updateDocumentVersionTranslation,
  getDocumentVersionTranslationQueryOptions,
} from "@/serverFunctions/documentVersionTranslation";
import { config, processTokens, tokenizer } from "@/serverFunctions/getContent";
import { $changeUserRole, getUsersQueryOptions } from "@/serverFunctions/user";
import MDEditor from "@uiw/react-md-editor";
import Markdoc from "@markdoc/markdoc";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  CopyIcon,
  LucideTrash2,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { transformMarkdoc } from "@/markdoc/config";

export const Route = createFileRoute("/_authed/admin")({
  component: RouteComponent,
  loader: async () => await $getDocuments(),
});

function RouteComponent() {
  return (
    <Tabs defaultValue="news">
      <TabsList>
        <TabsTrigger value="news">News</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="users">Users</TabsTrigger>
      </TabsList>
      <TabsContent value="news"></TabsContent>
      <TabsContent value="documents">
        <Suspense fallback={<div>Loading...</div>}>
          <ManageDocuments />
        </Suspense>
      </TabsContent>
      <TabsContent value="users">
        <Suspense fallback={<div>Loading...</div>}>
          <ManageUsers />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}

function ManageDocuments() {
  const { data: documents } = useSuspenseQuery(getDocumentsQueryOptions());

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null
  );

  const [assetsOpen, setAssetsOpen] = useState(false);

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

  const t = useTranslations("Navbar");

  return (
    <section className="flex items-stretch gap-2">
      <ul className="bg-primary max-w-md space-y-4 rounded-sm p-4">
        {documents.map((doc) => (
          <li key={doc.id}>
            <Button
              className={cn({
                "border-secondary-light border": doc.id === selectedDocumentId,
              })}
              onClick={() => handleSelectDoc(doc.id)}
              variant={"toggle"}
            >
              {t(doc.contentId as any)}
            </Button>
          </li>
        ))}
      </ul>
      <Suspense fallback={<div>Loading...</div>}>
        {!selectedDocumentId ? (
          <p>No document selected</p>
        ) : (
          <ListOfVersions
            selectedVersionId={selectedVersionId}
            onSelect={setSelectedVersionId}
            documentId={selectedDocumentId}
          />
        )}
      </Suspense>

      <div className="flex-1 rounded-sm bg-white p-4">
        <LocaleSwitcher
          locale={selectedLocale}
          onSwitchLocale={setSelectedLocale}
        />
        <Suspense fallback={<div>Loading...</div>}>
          {selectedVersionId ? (
            <TranslationDetails
              locale={selectedLocale}
              documentVersionId={selectedVersionId}
            />
          ) : (
            <p>Select a version</p>
          )}
        </Suspense>
      </div>
      <div
        className={cn("w-20 rounded-sm bg-white transition-all", {
          "w-[50rem]": assetsOpen,
        })}
      >
        <Button
          onClick={() => setAssetsOpen((prev) => !prev)}
          className="text-black"
          variant={"plain"}
        >
          <ArrowLeft
            className={cn("transition-transform", { "rotate-180": assetsOpen })}
          />
          <Label
            className={cn("origin-left", {
              "translate-x-5 rotate-90": !assetsOpen,
            })}
          >
            Assets
          </Label>
        </Button>
        {assetsOpen ? (
          <Suspense fallback={<Skeleton />}>
            <Assets />
          </Suspense>
        ) : null}
      </div>
    </section>
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
    <ul className="space-y-2 rounded-sm bg-white p-2">
      {versions.map((v) => (
        <li className="" key={v.id}>
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

function TranslationDetails({
  documentVersionId,
  locale,
}: {
  documentVersionId: string;
  locale: Locale;
}) {
  const documentVersionTranslationQO =
    getDocumentVersionTranslationQueryOptions({
      documentVersionId,
      locale,
    });

  const queryClient = useQueryClient();

  const { data: versionDetails } = useSuspenseQuery(
    documentVersionTranslationQO
  );

  const [value, setValue] = useState(versionDetails?.content);

  useEffect(() => {
    setValue(versionDetails?.content ?? "");
  }, [versionDetails?.content]);

  const { mutate: createTranslation } = useMutation({
    mutationFn: $createDocumentVersionTranslation,
    onSuccess: () => {
      queryClient.invalidateQueries(documentVersionTranslationQO);
    },
  });

  const { mutate: updateTranslation } = useMutation({
    mutationFn: $updateDocumentVersionTranslation,
    onSuccess: () => {
      queryClient.invalidateQueries(documentVersionTranslationQO);
    },
  });

  const { mutate: deleteTranslation } = useMutation({
    mutationFn: $deleteDocumentVersionTranslation,
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  function handleSubmit() {
    if (!value) return;
    if (!versionDetails) {
      createTranslation({
        data: { documentVersionId, locale, content: value, title: "" },
      });
    } else {
      updateTranslation({
        data: {
          documentVersionId,
          locale,
          content: value,
        },
      });
    }
  }

  function handleDelete() {
    deleteTranslation({
      data: {
        documentVersionId,
        locale,
      },
    });
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <p>Locale: {versionDetails?.locale}</p>
      <p> Author: {versionDetails?.translator?.name || "Unknown"} </p>
      <div data-color-mode="light" className="flex-1">
        <MDEditor
          highlightEnable={true}
          height="100%"
          value={value}
          onChange={setValue}
          className="md-editor"
          components={{
            preview: (source) => {
              const { content } = transformMarkdoc({ rawContent: source });

              return <RenderMarkdoc content={content} />;
            },
          }}
        />
      </div>
      <div className="flex justify-end gap-5">
        <Button onClick={handleDelete} variant={"plain"} className="bg-white">
          <LucideTrash2 className="text-red-600" />
        </Button>
        <Button onClick={handleSubmit} size={"lg"}>
          {versionDetails ? "Update" : "Create"}
        </Button>
      </div>
    </div>
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

function Assets() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(listAssetsQueryOptions());

  const [filter, setFilter] = useState("");

  const filteredAssets = useMemo(() => {
    if (!data) return [];
    if (!filter) return data;

    return data.filter(
      (asset) =>
        asset.name.includes(filter) || asset.description.includes(filter)
    );
  }, [data, filter]);

  const [addingNewAsset, setAddingNewAsset] = useState(false);
  const [newAssetName, setNewAssetName] = useState("");

  function handleChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewAssetName(file.name);
  }

  const { mutate } = useMutation({
    mutationFn: $uploadAsset,
    onSuccess: () => {
      queryClient.invalidateQueries(listAssetsQueryOptions());
    },
  });

  const { mutate: deleteAsset } = useMutation({
    mutationFn: (id: string) => $deleteAsset({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries(listAssetsQueryOptions());
    },
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const fd = new FormData(e.target as HTMLFormElement);

    mutate({ data: fd });

    setAddingNewAsset(false);
  }

  const [, copy] = useCopyToClipboard();

  return (
    <section className="flex flex-col gap-2 p-4">
      <Label>
        <span className="text-sm whitespace-nowrap">Search filter</span>
        <Input type="text" onChange={(e) => setFilter(e.target.value)} />
      </Label>

      <div className="flex-1">
        <Table className="max-h-full overflow-y-auto">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Url</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAssets.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.mimeType}</TableCell>
                <TableCell>
                  <Button
                    variant={"cms-table-action"}
                    className="text-black"
                    onClick={() => copy(row.url)}
                  >
                    <CopyIcon className="size-4" />
                  </Button>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    onClick={() => deleteAsset(row.id)}
                    variant={"cms-table-action"}
                  >
                    <Trash2Icon className="text-accent size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button
        disabled={addingNewAsset}
        variant={"toggle"}
        onClick={() => setAddingNewAsset(true)}
      >
        <PlusIcon className="mr-2 inline size-4" /> Add new asset
      </Button>
      {addingNewAsset ? (
        <form onSubmit={onSubmit} className="space-y-1 p-3">
          <Input
            name="name"
            placeholder="Name"
            value={newAssetName}
            onChange={(e) => setNewAssetName(e.target.value)}
          />
          <Input name="description" placeholder="Description" />
          <Input
            name="file"
            type="file"
            accept="image/*,application/pdf"
            onChange={handleChangeFile}
          />
          <Button type="submit" className="ml-auto">
            <UploadIcon className="mr-2 inline size-4" />
            Upload
          </Button>
        </form>
      ) : null}
    </section>
  );
}
