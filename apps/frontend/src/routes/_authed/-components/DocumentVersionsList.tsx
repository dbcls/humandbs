import { ListItem } from "@/components/ListItem";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import {
  $cloneDocumentVersion,
  $createDocumentVersion,
  $deleteDocumentVersion,
  DocumentVersionListItemResponse,
  getDocumentVersionsListQueryOptions,
} from "@/serverFunctions/documentVersion";
import useConfirmationStore from "@/stores/confirmationStore";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CopyIcon, Trash2Icon } from "lucide-react";
import { StatusTag } from "./StatusTag";
import { useEffect, useRef, useState } from "react";

export function DocumentVersionsList({
  documentId,
  onSelect,
}: {
  documentId: string;
  onSelect: (documentVersionItem: DocumentVersionListItemResponse) => void;
}) {
  const [selectedVersionNumber, setSelectedVersionNumber] = useState<
    number | undefined
  >(undefined);

  const docIdRef = useRef(documentId);

  const queryClient = useQueryClient();

  const documentVersionsListQO = getDocumentVersionsListQueryOptions({
    documentId,
  });

  const { openConfirmation } = useConfirmationStore();

  const { data: versions } = useSuspenseQuery(documentVersionsListQO);

  useEffect(() => {
    if (!selectedVersionNumber) {
      // select first one
      setSelectedVersionNumber(versions?.[0]?.versionNumber);
      onSelect(versions?.[0]);
    } else {
      const selectedVersion = versions?.find(
        (v) => v.versionNumber === selectedVersionNumber
      );
      if (selectedVersion) {
        onSelect(selectedVersion);
      }
    }
    if (documentId !== docIdRef.current) {
      docIdRef.current = documentId;
      setSelectedVersionNumber(undefined);
    }
  }, [versions, selectedVersionNumber, documentId]);

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

  const { mutate: cloneDocumentVersion } = useMutation({
    mutationFn: (versionNumber: number) =>
      $cloneDocumentVersion({ data: { versionNumber, documentId } }),
    onSuccess: () => {
      queryClient.invalidateQueries(documentVersionsListQO);
    },
  });

  const canCloneVersion = (version: DocumentVersionListItemResponse) => {
    return version.statuses.includes("draft") && version.statuses.length === 1;
  };

  return (
    <ul>
      <Button
        variant={"accent"}
        className="mb-5 w-full"
        onClick={handleAddNewVersion}
      >
        Add new
      </Button>
      {versions.map((v, index) => {
        const isActive = selectedVersionNumber === v.versionNumber;
        return (
          <ListItem
            key={v.versionNumber + v.statuses.join()}
            isActive={isActive}
            onClick={() => setSelectedVersionNumber(v.versionNumber)}
          >
            <span>{v.versionNumber}</span>
            <span className="ml-4 flex items-center gap-1">
              {v.statuses.map((status) => (
                <StatusTag key={status} isActive={isActive} status={status} />
              ))}
              <Button
                variant={"ghost"}
                disabled={canCloneVersion(v)}
                size={"slim"}
                onClick={(e) => {
                  e.stopPropagation();
                  cloneDocumentVersion(v.versionNumber);
                }}
              >
                <CopyIcon
                  className={cn(
                    "text-secondary-light size-5 transition-colors",
                    {
                      "text-white": isActive,
                    }
                  )}
                />
              </Button>
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
    </ul>
  );
}
