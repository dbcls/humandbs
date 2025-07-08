import { Button } from "@/components/Button";
import { i18n, Locale } from "@/lib/i18n-config";
import {
  createGetDocumentVersionsQueryOptions,
  createGetDocVerTranslationsQueryOptions,
} from "@/lib/query-options";
import { getDocuments } from "@/serverFunctions/document";
import { createDocumentVersion } from "@/serverFunctions/documentVersion";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useCallback, useState } from "react";
import { useTranslations } from "use-intl";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/admin")({
  component: RouteComponent,
  loader: async () => await getDocuments(),
});

function RouteComponent() {
  const documents = Route.useLoaderData();

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
      <ul className="bg-primary max-w-md space-y-4 p-4">
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

      <div className="border-primary flex-1">
        <Suspense fallback={<div>Loading...</div>}>
          {selectedVersionId ? (
            <TranslationDetails
              locale={selectedLocale}
              versionId={selectedVersionId}
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
  const { data: versions } = useSuspenseQuery(
    createGetDocumentVersionsQueryOptions(documentId)
  );

  async function handleAddNewVersion() {
    await createDocumentVersion({ data: { documentId } });

    await queryClient.invalidateQueries(
      createGetDocumentVersionsQueryOptions(documentId)
    );
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

function TranslationDetails({
  versionId,
  locale,
}: {
  versionId: string;
  locale: Locale;
}) {
  const { data: versionDetails } = useSuspenseQuery(
    createGetDocVerTranslationsQueryOptions({ versionId, locale })
  );

  const [value, setValue] = useState("console.log('hello world!');");
  const onChange = useCallback((val: string) => {
    setValue(val);
  }, []);

  return (
    <div className="h-full w-full">
      <p>Locale: {versionDetails?.locale}</p>
      <p> Author: {versionDetails?.translator?.name || "Unknown"} </p>
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={[markdown()]}
        height="500px"
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
        }}
      />
    </div>
  );
}
