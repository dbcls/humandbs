import { Button } from "@/components/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UserRole } from "@/db/schema";
import { i18n, Locale } from "@/lib/i18n-config";
import { roles } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
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
import { markdown } from "@codemirror/lang-markdown";
import Markdoc from "@markdoc/markdoc";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { LucideTrash2 } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "use-intl";

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

  const onChange = useCallback((val: string) => {
    setValue(val);
  }, []);

  const content = useMemo(() => {
    if (!value) return null;
    const tokens = tokenizer.tokenize(value);
    const processed = processTokens(tokens);
    const ast = Markdoc.parse(processed);

    config.variables = {
      ...config.variables,
      locale,
      updatedAt: versionDetails?.updatedAt.toLocaleDateString(),
      version: `${versionDetails?.version.versionNumber}` || "Unknown",
    };
    return Markdoc.transform(ast, config);
  }, [value, versionDetails]);

  return (
    <div className="flex h-full flex-col gap-1">
      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="edit">
          <p>Locale: {versionDetails?.locale}</p>
          <p> Author: {versionDetails?.translator?.name || "Unknown"} </p>
          <CodeMirror
            value={value}
            onChange={onChange}
            className="flex-1 rounded-sm"
            extensions={[markdown(), EditorView.lineWrapping]}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
            }}
          />
        </TabsContent>
        <TabsContent value="preview">
          <RenderMarkdoc className="mx-auto" content={content} />
        </TabsContent>
      </Tabs>
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
