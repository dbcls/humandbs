import { ListItem } from "@/components/ListItem";
import { DocumentVersion } from "@/db/schema";
import {
  $createDocumentVersion,
  $deleteDocumentVersion,
  getDocumentVersionsListQueryOptions,
} from "@/serverFunctions/documentVersion";
import useConfirmationStore from "@/stores/confirmationStore";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { StatusTag } from "./StatusTag";
import { Button } from "@/components/ui/button";
import { Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

export function DocumentVersionsList({
  documentId,
  onSelect,
  selectedVersionId,
}: {
  documentId: string;
  onSelect?: (documentVersion: DocumentVersion) => void;
  selectedVersionId: string | undefined;
}) {
  const queryClient = useQueryClient();

  const documentVersionsListQO = getDocumentVersionsListQueryOptions({
    documentId,
  });

  const { openConfirmation } = useConfirmationStore();

  const { data: versions } = useSuspenseQuery(documentVersionsListQO);

  async function handleAddNewVersion() {
    await $createDocumentVersion({ data: { documentId } });

    await queryClient.invalidateQueries(documentVersionsListQO);
  }

  const { mutate: deleteDocumentVersion } = useMutation({
    mutationFn: (versionNumber: number) =>
      $deleteDocumentVersion({ data: { documentId, versionNumber } }),
    onMutate: async (versionNumber) => {
      await queryClient.cancelQueries(documentVersionsListQO);

      const previousVersions = queryClient.getQueryData(
        documentVersionsListQO.queryKey
      );

      queryClient.setQueryData(documentVersionsListQO.queryKey, (old) => {
        if (!old) return old;
        return old.filter((v) => v.versionNumber !== versionNumber);
      });

      return { previousVersions };
    },
    onError: (_error, _versionNumber, context) => {
      queryClient.setQueryData(
        documentVersionsListQO.queryKey,
        context?.previousVersions
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries(documentVersionsListQO);
    },
  });

  function handleClickDeleteVersion(versionNumber: number) {
    openConfirmation({
      title: "Delete Version",
      description: "Are you sure you want to delete this version?",
      actionLabel: "Delete",
      onAction: () => deleteDocumentVersion(versionNumber),
    });
  }

  return (
    <ul>
      {versions.map((v) => {
        const isActive = selectedVersionId === v.id;
        return (
          <ListItem
            key={v.id}
            isActive={isActive}
            onClick={() => onSelect?.(v)}
          >
            <span>{v.versionNumber}</span>
            <span className="flex items-center gap-1">
              <StatusTag isActive={isActive} status={v.status} />
              <Button
                variant={"ghost"}
                size={"slim"}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClickDeleteVersion(v.versionNumber);
                }}
              >
                <Trash2Icon
                  className={cn("text-danger size-5 transition-colors", {
                    "text-white": isActive,
                  })}
                />
              </Button>
            </span>
          </ListItem>
        );
      })}

      <Button
        variant={"accent"}
        className="mt-5 w-full"
        onClick={handleAddNewVersion}
      >
        Add new
      </Button>
    </ul>
  );
}
