import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  CopyIcon,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  ImageIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { SkeletonLoading } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { cn } from "@/lib/utils";
import {
  assetHierarchyQueryOptions,
  $createAssetFolder,
  $deleteAssetByPath,
  $deleteAssetFolder,
  $uploadAsset,
  type AssetHierarchyFolder,
  type AssetHierarchyFile,
  type AssetHierarchyItem,
} from "@/serverFunctions/assets";

function isImageFile(item: Extract<AssetHierarchyItem, { type: "file" }>) {
  if (item.mimeType.startsWith("image/")) return true;

  return /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(item.name);
}

function getFolderSegments(path: string) {
  return path ? path.split("/") : [];
}

function getCurrentFolder(
  root: AssetHierarchyFolder,
  selectedFolderPath: string,
): AssetHierarchyFolder {
  const segments = getFolderSegments(selectedFolderPath);

  let current = root;

  for (const segment of segments) {
    const next = current.children.find(
      (item): item is AssetHierarchyFolder =>
        item.type === "folder" && item.name === segment,
    );

    if (!next) break;

    current = next;
  }

  return current;
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
      (item): item is AssetHierarchyFolder =>
        item.type === "folder" && item.name === segment,
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
  const [newFolderName, setNewFolderName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [, copy] = useCopyToClipboard();

  const invalidateHierarchy = async () => {
    await queryClient.invalidateQueries(assetHierarchyQueryOptions());
  };

  const { mutate: createFolder, isPending: isCreatingFolder } = useMutation({
    mutationFn: $createAssetFolder,
    onSuccess: async () => {
      setNewFolderName("");
      await invalidateHierarchy();
    },
  });

  const { mutate: uploadAsset, isPending: isUploadingAsset } = useMutation({
    mutationFn: $uploadAsset,
    onSuccess: async (_result, variables) => {
      const file = variables.data.get("file");
      const folderPath = String(variables.data.get("folderPath") ?? "");

      if (file instanceof File) {
        const nextPath = folderPath
          ? `${folderPath}/${file.name}`
          : file.name;

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

      setUploadFile(null);
      await invalidateHierarchy();
    },
  });

  const { mutate: deleteAssetByPath, isPending: isDeletingAsset } = useMutation({
    mutationFn: $deleteAssetByPath,
    onSuccess: invalidateHierarchy,
  });

  const { mutate: deleteFolder, isPending: isDeletingFolder } = useMutation({
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

  const columns = useMemo(
    () => getFolderColumns(root, selectedFolderPath),
    [root, selectedFolderPath],
  );

  const currentFolder = columns[columns.length - 1] ?? root;
  const selectedFolderExists =
    selectedFolderPath === "" || currentFolder.path === selectedFolderPath;

  const selectedItem =
    currentFolder.children.find((item) => item.path === selectedItemPath) ??
    null;

  const canManageDeletes = mode === "manage";

  const displayFolderPath = selectedFolderPath || "files";

  function handleSelectItem(item: AssetHierarchyItem) {
    setSelectedItemPath(item.path);

    if (item.type === "folder") {
      setSelectedFolderPath(item.path);
      onSelectedFileChange?.(null);
      return;
    }

    onSelectedFileChange?.(item);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <Card className="p-4" caption="Actions" captionSize="sm">
        <div className="grid gap-4 md:grid-cols-2">
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newFolderName.trim()) return;

              createFolder({
                data: {
                  parentPath: selectedFolderPath,
                  folderName: newFolderName,
                },
              });
            }}
          >
            <div className="text-sm font-medium">
              Create folder in <span className="text-secondary">{displayFolderPath}</span>
            </div>
            <div className="flex gap-2">
              <Input
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="Folder name"
                variant="form"
              />
              <Button disabled={!newFolderName.trim() || isCreatingFolder} type="submit">
                <FolderPlus className="mr-2 size-4" />
                Create
              </Button>
            </div>
          </form>

          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!uploadFile) return;

              const formData = new FormData();
              formData.set("file", uploadFile);
              formData.set("folderPath", selectedFolderPath);

              uploadAsset({ data: formData });
            }}
          >
            <div className="text-sm font-medium">
              Upload to <span className="text-secondary">{displayFolderPath}</span>
            </div>
            <div className="flex gap-2">
              <Input
                type="file"
                variant="form"
                onChange={(event) => {
                  setUploadFile(event.target.files?.[0] ?? null);
                }}
              />
              <Button disabled={!uploadFile || isUploadingAsset} type="submit">
                <FilePlus2 className="mr-2 size-4" />
                Upload
              </Button>
            </div>
          </form>
        </div>

        {!selectedFolderExists && selectedFolderPath ? (
          <div className="mt-4 flex items-center justify-between rounded-sm border border-dashed p-3 text-sm">
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
      </Card>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-h-0 h-full gap-3">
            {columns.map((folder) => (
              <Card
                key={folder.path || "__root__"}
                className="flex min-h-0 w-[260px] shrink-0 flex-col p-3"
                caption={folder.path || "files"}
                captionSize="sm"
              >
                <div className="min-h-0 overflow-y-auto">
                  <ul className="space-y-1">
                    {folder.children.length === 0 ? (
                      <li className="rounded-sm border border-dashed p-3 text-sm text-gray-500">
                        Empty folder
                      </li>
                    ) : (
                      folder.children.map((item) => {
                        const isActive = item.path === selectedItemPath;

                        return (
                          <li key={item.path}>
                            <Button
                              variant="plain"
                              className={cn(
                                "flex w-full items-center justify-start gap-2 rounded-sm px-3 py-2 text-left",
                                isActive
                                  ? "bg-secondary-light text-white"
                                  : "hover:bg-hover",
                              )}
                              onClick={() => {
                                handleSelectItem(item);
                              }}
                            >
                              {item.type === "folder" ? (
                                <>
                                  <Folder className="size-4 shrink-0" />
                                  <span className="min-w-0 flex-1 truncate">
                                    {item.name}
                                  </span>
                                  <ChevronRight className="size-4 shrink-0" />
                                </>
                              ) : (
                                <>
                                  {isImageFile(item) ? (
                                    <span className="bg-primary flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border">
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
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <Card
          className="flex min-h-0 w-[300px] shrink-0 flex-col p-4 xl:w-[340px]"
          caption="Details"
        >
        {selectedItem ? (
          selectedItem.type === "folder" ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Folder className="text-secondary size-5" />
                <div className="font-medium">{selectedItem.name}</div>
              </div>
              <dl className="space-y-2">
                <div>
                  <dt className="text-xs uppercase text-gray-500">Path</dt>
                  <dd className="break-all">{selectedItem.path}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-gray-500">Items</dt>
                  <dd>{selectedItem.children.length}</dd>
                </div>
              </dl>
              <Button
                disabled={selectedItem.children.length > 0 || isDeletingFolder}
                variant="outline"
                onClick={() =>
                  deleteFolder({ data: { folderPath: selectedItem.path } })
                }
              >
                <Trash2Icon className="mr-2 size-4" />
                Delete empty folder
              </Button>
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
                    <FileText className="text-secondary size-12" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="font-medium">{selectedItem.name}</div>
                <dl className="space-y-2">
                  <div>
                    <dt className="text-xs uppercase text-gray-500">Type</dt>
                    <dd>{selectedItem.mimeType || "Unknown"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-gray-500">URL</dt>
                    <dd className="break-all">{selectedItem.url}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-gray-500">Path</dt>
                    <dd className="break-all">{selectedItem.path}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-gray-500">Size</dt>
                    <dd>{Intl.NumberFormat().format(selectedItem.size)} bytes</dd>
                  </div>
                </dl>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => copy(selectedItem.url)}
                  >
                    <CopyIcon className="mr-2 size-4" />
                    Copy URL
                  </Button>
                  {canManageDeletes ? (
                    <Button
                      disabled={isDeletingAsset}
                      variant="outline"
                      onClick={() =>
                        deleteAssetByPath({ data: { assetPath: selectedItem.path } })
                      }
                    >
                      <Trash2Icon className="mr-2 size-4" />
                      Delete file
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="flex min-h-40 items-center justify-center text-sm text-gray-500">
            Select a folder or file
          </div>
        )}
        </Card>
      </div>
    </section>
  );
}

export function AssetsBrowserFallback() {
  return <SkeletonLoading />;
}
