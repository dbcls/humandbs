import { Button } from "@/components/Button";
import { Locale } from "@/lib/i18n-config";
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
import { LucideTrash2 } from "lucide-react";
import { useEffect, useState } from "react";

export function TranslationDetails({
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
      <div className="flex h-fit justify-end gap-5">
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
