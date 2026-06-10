import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ClientOnly } from "@tanstack/react-router";
import {
  ChevronRight,
  CopyIcon,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  LucideMoreVertical,
  Trash2,
} from "lucide-react";

import { useMemo, useRef, useState } from "react";

import { Card } from "@/components/Card";
import { InputDialog } from "@/components/InputDialog";
import { SkeletonLoading } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { cn } from "@/lib/utils";
import type {
  AssetHierarchyFile,
  AssetHierarchyFolder,
  AssetHierarchyItem,
} from "@/serverFunctions/assets";
import {
  $createAssetFolder,
  $deleteAssetByPath,
  $deleteAssetFolder,
  $renameAsset,
  $renameAssetFolder,
  $uploadAsset,
  assetHierarchyQueryOptions,
} from "@/serverFunctions/assets";
import useConfirmationStore from "@/stores/confirmationStore";

function isImageFile(item: Extract<AssetHierarchyItem, { type: "file" }>) {
  if (item.mimeType.startsWith("image/")) return true;

  return /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(item.name);
}

function getFolderSegments(path: string) {
  return path ? path.split("/") : [];
}

function getFolderColumns(
  root: AssetHierarchyFolder,
  selectedFolderPath: string,
): AssetHierarchyFolder[] {
  const segments = getFolderSegments(selectedFolderPath);
  const columns: AssetHierarchyFolder[] = [root];

  let current = root;

  for (const segment of segments) {
    const next = current.children.find(
      (item): item is AssetHierarchyFolder => item.type === "folder" && item.name === segment,
    );

    if (!next) break;

    columns.push(next);
    current = next;
  }

  return columns;
}

function splitFolderPath(path: string) {
  return path ? path.split("/") : [];
}

function getParentFolderPath(path: string) {
  const segments = splitFolderPath(path);
  segments.pop();
  return segments.join("/");
}

function getFolderBaseName(path: string) {
  const segments = splitFolderPath(path);
  return segments[segments.length - 1] ?? "";
}

interface AssetsBrowserProps {
  mode?: "manage" | "pick";
  initialFolderPath?: string;
  onSelectedFileChange?: (file: AssetHierarchyFile | null) => void;
}

export function AssetsBrowser({
  mode = "manage",
  initialFolderPath = "",
  onSelectedFileChange,
}: AssetsBrowserProps) {
  const queryClient = useQueryClient();
  const { data: root } = useSuspenseQuery(assetHierarchyQueryOptions());
  const [selectedFolderPath, setSelectedFolderPath] = useState(initialFolderPath);
  const [selectedItemPath, setSelectedItemPath] = useState<string | null>(null);
  const [creatingFolderIn, setCreatingFolderIn] = useState<{
    path: string;
    existingNames: string[];
  } | null>(null);
  const [uploadingToFolder, setUploadingToFolder] = useState<string | null>(null);
  const [renamingItem, setRenamingItem] = useState<{
    item: AssetHierarchyItem;
    siblings: AssetHierarchyItem[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastColumnRef = useRef<HTMLDivElement>(null);
  const [, copy] = useCopyToClipboard();
  const { openConfirmation } = useConfirmationStore();

  const invalidateHierarchy = async () => {
    await queryClient.invalidateQueries(assetHierarchyQueryOptions());
  };

  const { mutate: createFolder, isPending: isCreatingFolder } = useMutation({
    mutationFn: $createAssetFolder,
    onSuccess: async () => {
      setCreatingFolderIn(null);
      await invalidateHierarchy();
    },
  });

  const { mutate: uploadAsset, isPending: isUploadingAsset } = useMutation({
    mutationFn: $uploadAsset,
    onSuccess: async (_result, variables) => {
      const file = variables.data.get("file");
      const folderPath = String(variables.data.get("folderPath") ?? "");

      if (file instanceof File) {
        const nextPath = folderPath ? `${folderPath}/${file.name}` : file.name;

        setSelectedFolderPath(folderPath);
        setSelectedItemPath(nextPath);

        if (mode === "pick") {
          onSelectedFileChange?.({
            type: "file",
            name: file.name,
            path: nextPath,
            url: `/files/${nextPath}`,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
          });
        }
      }

      await invalidateHierarchy();
    },
  });

  const { mutate: deleteAssetByPath } = useMutation({
    mutationFn: $deleteAssetByPath,
    onSuccess: invalidateHierarchy,
  });

  const { mutate: deleteFolder } = useMutation({
    mutationFn: $deleteAssetFolder,
    onSuccess: async () => {
      setSelectedItemPath(null);
      setSelectedFolderPath((currentPath) => {
        const parentSegments = getFolderSegments(currentPath);
        parentSegments.pop();
        return parentSegments.join("/");
      });
      await invalidateHierarchy();
    },
  });

  const { mutate: renameAsset, isPending: isRenamingAsset } = useMutation({
    mutationFn: $renameAsset,
    onSuccess: async (result) => {
      setRenamingItem(null);
      setSelectedItemPath(result.path);
      await invalidateHierarchy();
    },
  });

  const { mutate: renameFolder, isPending: isRenamingFolder } = useMutation({
    mutationFn: $renameAssetFolder,
    onSuccess: async (result) => {
      setRenamingItem(null);
      setSelectedItemPath(result.path);
      setSelectedFolderPath(result.path);
      await invalidateHierarchy();
    },
  });

  const columns = useMemo(
    () => getFolderColumns(root, selectedFolderPath),
    [root, selectedFolderPath],
  );

  const currentFolder = columns[columns.length - 1] ?? root;
  const selectedFolderExists =
    selectedFolderPath === "" || currentFolder.path === selectedFolderPath;

  const selectedItem =
    currentFolder.children.find((item) => item.path === selectedItemPath) ?? null;

  const canManage = mode === "manage";

  function handleSelectItem(item: AssetHierarchyItem) {
    setSelectedItemPath(item.path);

    if (item.type === "folder") {
      setSelectedFolderPath(item.path);
      onSelectedFileChange?.(null);
      requestAnimationFrame(() => {
        lastColumnRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "end" });
      });
      return;
    }

    onSelectedFileChange?.(item);
  }

  async function handleRenameSubmit(newName: string) {
    if (!renamingItem) return;
    const { item } = renamingItem;
    if (item.type === "folder") {
      renameFolder({ data: { folderPath: item.path, newName } });
    } else {
      renameAsset({ data: { assetPath: item.path, newName } });
    }
  }

  function handleDeleteItem(item: AssetHierarchyItem) {
    const isFolder = item.type === "folder";
    const isNonEmpty = isFolder && (item as AssetHierarchyFolder).children.length > 0;
    openConfirmation({
      title: isFolder ? "Delete folder" : "Delete file",
      description: isNonEmpty
        ? `"${item.name}" is not empty. All its contents will be permanently deleted. Are you sure?`
        : `Are you sure you want to delete "${item.name}"?`,
      actionLabel: "Delete",
      onAction: () => {
        if (isFolder) {
          deleteFolder({ data: { folderPath: item.path } });
        } else {
          deleteAssetByPath({ data: { assetPath: item.path } });
        }
      },
    });
  }

  function handleUploadClick(folderPath: string) {
    setUploadingToFolder(folderPath);
    fileInputRef.current?.click();
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || uploadingToFolder === null) return;

    const formData = new FormData();
    formData.set("file", file);
    formData.set("folderPath", uploadingToFolder);
    uploadAsset({ data: formData });

    event.target.value = "";
    setUploadingToFolder(null);
  }

  return (
    <section className="flex min-h-0 max-w-full flex-1 flex-col items-stretch gap-4">
      {/* Hidden file input shared across all folder upload buttons */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />

      <InputDialog
        title={`Rename ${renamingItem?.item.type === "folder" ? "folder" : "file"}`}
        description={renamingItem ? `Current name: ${renamingItem.item.name}` : undefined}
        label="New name"
        trigger={<span />}
        initialValue={renamingItem?.item.name ?? ""}
        open={renamingItem !== null}
        onOpenChange={(open) => {
          if (!open) setRenamingItem(null);
        }}
        validateAsync={async (value) => {
          if (!value.trim()) return "Name is required";
          if (!renamingItem) return undefined;
          const isDuplicate = renamingItem.siblings.some(
            (s) => s.path !== renamingItem.item.path && s.name === value.trim(),
          );
          if (isDuplicate) {
            return `A ${renamingItem.item.type === "folder" ? "folder" : "file"} named "${value.trim()}" already exists here.`;
          }
          return undefined;
        }}
        onSubmit={handleRenameSubmit}
      />

      <InputDialog
        title="Create folder"
        label="Folder name"
        trigger={<span />}
        open={creatingFolderIn !== null}
        onOpenChange={(open) => {
          if (!open) setCreatingFolderIn(null);
        }}
        validateAsync={async (value) => {
          if (!value.trim()) return "Name is required";
          if (creatingFolderIn?.existingNames.includes(value.trim())) {
            return `A folder or file named "${value.trim()}" already exists here.`;
          }
          return undefined;
        }}
        onSubmit={async (folderName) => {
          createFolder({ data: { parentPath: creatingFolderIn?.path ?? "", folderName } });
        }}
      />

      {!selectedFolderExists && selectedFolderPath ? (
        <div className="flex items-center justify-between rounded-sm border border-dashed p-3 text-sm">
          <div>
            Folder <span className="font-medium">{selectedFolderPath}</span> does not exist yet.
          </div>
          <Button
            disabled={isCreatingFolder}
            variant="outline"
            onClick={() =>
              createFolder({
                data: {
                  parentPath: getParentFolderPath(selectedFolderPath),
                  folderName: getFolderBaseName(selectedFolderPath),
                },
              })
            }
          >
            <FolderPlus className="mr-2 size-4" />
            Create this folder
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 max-w-full flex-1 gap-4 overflow-x-hidden">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex h-full min-h-0 flex-1 gap-3">
            {columns.map((folder, index) => (
              <div key={folder.path || "__root__"} ref={index === columns.length - 1 ? lastColumnRef : null}>
              <Card
                className="flex min-h-0 w-[260px] shrink-0 flex-col p-3"
                caption={folder.path || "files"}
                captionSize="sm"
              >
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <ul className="space-y-1">
                    {folder.children.length === 0 ? (
                      <li className="rounded-sm border border-dashed p-3 text-gray-500 text-sm">
                        Empty folder
                      </li>
                    ) : (
                      folder.children.map((item) => {
                        const isActive = item.path === selectedItemPath;

                        return (
                          <li
                            key={item.path}
                            className={cn(
                              "flex items-center rounded-sm",
                              isActive ? "bg-secondary-light text-white" : "hover:bg-hover",
                            )}
                          >
                            <Button
                              variant="plain"
                              className="flex min-w-0 flex-1 items-center justify-start gap-2 px-3 py-2 text-left"
                              onClick={() => handleSelectItem(item)}
                            >
                              {item.type === "folder" ? (
                                <>
                                  <Folder className="size-4 shrink-0" />
                                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                                  <ChevronRight className="size-4 shrink-0" />
                                </>
                              ) : (
                                <>
                                  {isImageFile(item) ? (
                                    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-primary">
                                      <img
                                        src={item.url}
                                        alt={item.name}
                                        className="size-full object-cover"
                                      />
                                    </span>
                                  ) : (
                                    <FileText className="size-4 shrink-0" />
                                  )}
                                  <span className="min-w-0 truncate">{item.name}</span>
                                </>
                              )}
                            </Button>
                            {canManage && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <LucideMoreVertical className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuGroup>
                                    <DropdownMenuItem
                                      onSelect={(e) => {
                                        e.preventDefault();
                                        setRenamingItem({ item, siblings: folder.children });
                                      }}
                                    >
                                      <Label>Rename</Label>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onSelect={(e) => {
                                        e.preventDefault();
                                        handleDeleteItem(item);
                                      }}
                                    >
                                      <Label>
                                        <Trash2 />
                                        Delete
                                      </Label>
                                    </DropdownMenuItem>
                                  </DropdownMenuGroup>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
                {canManage && (
                  <div className="mt-2 flex gap-1 border-t pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() =>
                        setCreatingFolderIn({
                          path: folder.path,
                          existingNames: folder.children.map((c) => c.name),
                        })
                      }
                    >
                      <FolderPlus className="mr-1 size-3" />
                      Create folder...
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-xs"
                      disabled={isUploadingAsset}
                      onClick={() => handleUploadClick(folder.path)}
                    >
                      <FilePlus2 className="mr-1 size-3" />
                      Upload file...
                    </Button>
                  </div>
                )}
              </Card>
              </div>
            ))}
          </div>
        </div>

        <div className="w-96">
          <p className="font-semibold text-md text-secondary">Details</p>

          {selectedItem ? (
            selectedItem.type === "folder" ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Folder className="size-5 text-secondary" />
                  <div className="font-medium">{selectedItem.name}</div>
                </div>
                <dl className="space-y-2">
                  <div>
                    <dt className="text-gray-500 text-xs uppercase">Path</dt>
                    <dd className="break-all">{selectedItem.path}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 text-xs uppercase">Items</dt>
                    <dd>{selectedItem.children.length}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="overflow-hidden rounded-sm border bg-gray-50">
                  {isImageFile(selectedItem) ? (
                    <img
                      src={selectedItem.url}
                      alt={selectedItem.name}
                      className="h-48 w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-48 items-center justify-center">
                      <FileText className="size-12 text-secondary" />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="font-medium">{selectedItem.name}</div>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">Type</dt>
                      <dd>{selectedItem.mimeType || "Unknown"}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">URL</dt>
                      <dd className="break-all">{selectedItem.url}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">Path</dt>
                      <dd className="break-all">{selectedItem.path}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">Size</dt>
                      <dd>{Intl.NumberFormat().format(selectedItem.size)} bytes</dd>
                    </div>
                  </dl>
                  <ClientOnly>
                    <Button
                      variant="outline"
                      onClick={() => copy(`${window.location.origin}${selectedItem.url}`)}
                    >
                      <CopyIcon className="mr-2 size-4" />
                      Copy URL
                    </Button>
                  </ClientOnly>
                </div>
              </div>
            )
          ) : (
            <div className="flex min-h-40 items-center justify-center text-gray-500 text-sm">
              Select a folder or file
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function AssetsBrowserFallback() {
  return <SkeletonLoading />;
}
