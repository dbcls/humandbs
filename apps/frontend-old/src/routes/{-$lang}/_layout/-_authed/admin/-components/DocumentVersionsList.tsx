import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CopyIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { ListItem } from "@/components/ListItem";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  $cloneDocumentVersion,
  $createDocumentVersion,
  $deleteDocumentVersion,
  type DocVersionListItemResponse,
  getDocumentVersionsListQueryOptions,
} from "@/serverFunctions/documentVersion";
import useConfirmationStore from "@/stores/confirmationStore";

import { AddNewButton } from "./AddNewButton";
import { StatusTag } from "./StatusTag";

export function DocumentVersionsList({
  contentId,
  onSelect,
}: {
  contentId: string;
  onSelect: (documentVersionItem: DocVersionListItemResponse) => void;
}) {
  const documentVersionsListQO = getDocumentVersionsListQueryOptions({
    contentId,
  });

  const { data: versions } = useSuspenseQuery(documentVersionsListQO);

  const [selectedVersion, setSelectedVersion] = useState<
    DocVersionListItemResponse | undefined
  >(versions[0]);

  const queryClient = useQueryClient();

  const { openConfirmation } = useConfirmationStore();

  // TODO fix jiggling on document select, cause maybe here
  useEffect(() => {
    setSelectedVersion(versions[0]);
    onSelect(versions[0]);
  }, [versions, onSelect]);

  async function handleAddNewVersion() {
    await $createDocumentVersion({ data: { contentId } });

    await queryClient.invalidateQueries(documentVersionsListQO);
  }

  const { mutate: deleteDocumentVersion } = useMutation({
    mutationFn: (versionNumber: number) =>
      $deleteDocumentVersion({ data: { contentId, versionNumber } }),
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
      $cloneDocumentVersion({ data: { versionNumber, contentId } }),
    onMutate: async (versionNumber) => {
      await queryClient.cancelQueries(documentVersionsListQO);

      const previousVersions = queryClient.getQueryData(
        documentVersionsListQO.queryKey
      );

      queryClient.setQueryData(documentVersionsListQO.queryKey, (prev) => {
        if (!prev) return;

        const versionToClone = prev.find(
          (v) => v.versionNumber === versionNumber
        );

        const newVersionNumber =
          Math.max(...prev.map((v) => v.versionNumber)) + 1;

        if (!versionToClone) return;

        return [
          { ...versionToClone, versionNumber: newVersionNumber },
          ...prev,
        ];
      });

      return { previousVersions };
    },
    onError: (_, __, context) => {
      if (context) {
        queryClient.setQueryData(
          documentVersionsListQO.queryKey,
          context.previousVersions
        );
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries(documentVersionsListQO);
    },
  });

  const canCloneVersion = (version: DocVersionListItemResponse) => {
    return !(
      version.statuses.includes("draft") && version.statuses.length === 1
    );
  };

  function handleSelectVersion(version: DocVersionListItemResponse) {
    setSelectedVersion(version);
    onSelect(version);
  }

  return (
    <ul>
      <li className="mb-5">
        <AddNewButton onClick={handleAddNewVersion} />
      </li>

      {versions.map((v) => {
        const isActive = selectedVersion?.versionNumber === v.versionNumber;
        return (
          <ListItem
            key={v.versionNumber + v.statuses.join()}
            isActive={isActive}
            onClick={() => handleSelectVersion(v)}
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
