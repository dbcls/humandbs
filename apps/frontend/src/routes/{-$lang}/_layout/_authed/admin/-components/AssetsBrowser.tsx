import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight, FileText, Folder, ImageIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/Card";
import { SkeletonLoading } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  assetHierarchyQueryOptions,
  type AssetHierarchyFolder,
  type AssetHierarchyItem,
} from "@/serverFunctions/assets";

function isImageFile(item: Extract<AssetHierarchyItem, { type: "file" }>) {
  return item.mimeType.startsWith("image/");
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

export function AssetsBrowser() {
  const { data: root } = useSuspenseQuery(assetHierarchyQueryOptions());
  const [selectedFolderPath, setSelectedFolderPath] = useState("");
  const [selectedItemPath, setSelectedItemPath] = useState<string | null>(null);

  const columns = useMemo(
    () => getFolderColumns(root, selectedFolderPath),
    [root, selectedFolderPath],
  );

  const currentFolder = columns[columns.length - 1] ?? root;

  const selectedItem =
    currentFolder.children.find((item) => item.path === selectedItemPath) ??
    null;

  return (
    <section className="flex min-h-0 flex-1 gap-4">
      <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        {columns.map((folder) => (
          <Card
            key={folder.path || "__root__"}
            className="flex min-h-0 flex-col p-3"
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
                            isActive ? "bg-secondary-light text-white" : "hover:bg-hover",
                          )}
                          onClick={() => {
                            setSelectedItemPath(item.path);

                            if (item.type === "folder") {
                              setSelectedFolderPath(item.path);
                            }
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
                                <ImageIcon className="size-4 shrink-0" />
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

      <Card className="flex w-[320px] shrink-0 flex-col p-4" caption="Details">
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
              </div>
            </div>
          )
        ) : (
          <div className="flex min-h-40 items-center justify-center text-sm text-gray-500">
            Select a folder or file
          </div>
        )}
      </Card>
    </section>
  );
}

export function AssetsBrowserFallback() {
  return <SkeletonLoading />;
}
