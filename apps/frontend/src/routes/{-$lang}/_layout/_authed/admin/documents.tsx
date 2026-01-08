import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";

import { Card } from "@/components/Card";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentVersionListItemResponse } from "@/serverFunctions/documentVersion";

import { DocumentsList } from "./-components/DocumentsList";
import { DocumentVersionContent } from "./-components/DocumentVersionContent";
import { DocumentVersionsList } from "./-components/DocumentVersionsList";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/documents"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const [selectedContentId, setSelectedContentId] = useState<string>();

  const [selectedVersion, setSelectedVersion] =
    useState<DocumentVersionListItemResponse | null>(null);

  function handleSelectDoc(contentId: string) {
    if (selectedContentId !== contentId) {
      setSelectedVersion(null);
    }
    setSelectedContentId(contentId);
  }

  return (
    <>
      <Card
        className="w-cms-list-panel flex h-full flex-col"
        caption="Documents"
        containerClassName="overflow-auto flex-1 max-h-full"
      >
        <Suspense fallback={<Skeleton />}>
          <DocumentsList
            onSelectDoc={handleSelectDoc}
            selectedContentId={selectedContentId}
          />
        </Suspense>
      </Card>

      {selectedContentId ? (
        <>
          <Card className="w-80" caption="Versions">
            <Suspense
              fallback={
                <div>
                  <Skeleton />
                </div>
              }
            >
              <DocumentVersionsList
                contentId={selectedContentId}
                onSelect={setSelectedVersion}
              />
            </Suspense>
          </Card>
          {selectedVersion?.versionNumber ? (
            <DocumentVersionContent
              key={selectedVersion.contentId + selectedVersion.versionNumber}
              documentVersionItem={selectedVersion}
            />
          ) : (
            <Card className="flex-1" captionSize={"sm"} caption="Details">
              Select a version
            </Card>
          )}
        </>
      ) : (
        <div> No document selected </div>
      )}
    </>
  );
}
