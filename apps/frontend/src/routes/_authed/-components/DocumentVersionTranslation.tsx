import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { i18n, Locale } from "@/lib/i18n-config";
import { cn } from "@/lib/utils";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import {
  $createDocumentVersionTranslation,
  $deleteDocumentVersionTranslation,
  $updateDocumentVersionTranslation,
  getDocumentVersionTranslationQueryOptions,
} from "@/serverFunctions/documentVersionTranslation";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import MDEditor from "@uiw/react-md-editor";
import { useEffect, useState } from "react";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { StatusTag } from "./StatusTag";
import { DocumentVersion } from "@/db/schema";

export function DocumentVersionTranslation({
  documentVersion,
  className,
}: {
  documentVersion: DocumentVersion;
  locale: Locale;
  className?: string;
}) {
  const [selectedLocale, setSelectedLocale] = useState<Locale>(
    i18n.defaultLocale
  );

  const documentVersionTranslationQO =
    getDocumentVersionTranslationQueryOptions({
      documentVersionId: documentVersion.id,
      locale: selectedLocale,
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
        data: {
          documentVersionId: documentVersion.id,
          locale: selectedLocale,
          content: value,
          title: "",
        },
      });
    } else {
      updateTranslation({
        data: {
          documentVersionId: documentVersion.id,
          locale: selectedLocale,
          content: value,
        },
      });
    }
  }

  function handleDelete() {
    deleteTranslation({
      data: {
        documentVersionId: documentVersion.id,
        locale: selectedLocale,
      },
    });
  }

  return (
    <Card
      caption={
        <span className="align-middle">
          Content
          <StatusTag
            className="ml-2 inline-block"
            status={documentVersion.status}
          />
        </span>
      }
      captionSize={"sm"}
      className={cn("flex-1", className)}
    >
      <LocaleSwitcher
        locale={selectedLocale}
        onSwitchLocale={setSelectedLocale}
      />
      <div className="flex flex-col gap-2">
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
        {documentVersion.status === "draft" ? (
          <div className="flex h-fit justify-end gap-5">
            <Button onClick={handleSubmit} size={"lg"} variant={"action"}>
              Save draft
            </Button>
            <Button onClick={() => {}} size={"lg"} variant={"accent"}>
              Publish
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
