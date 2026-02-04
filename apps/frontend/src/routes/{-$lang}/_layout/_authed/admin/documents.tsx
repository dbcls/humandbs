import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";

import { Card } from "@/components/Card";
import { Skeleton } from "@/components/ui/skeleton";

import { DocumentsList } from "./-components/DocumentsList";
import { DocumentVersion } from "./-components/DocumentVersion2";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/documents"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const [selectedContentId, setSelectedContentId] = useState<string>();

  return (
    <>
      <Card
        className="w-cms-list-panel flex h-full flex-col"
        caption="Documents"
        containerClassName="overflow-auto flex-1 max-h-full"
      >
        <Suspense fallback={<Skeleton />}>
          <DocumentsList
            onSelectDoc={setSelectedContentId}
            selectedContentId={selectedContentId}
          />
        </Suspense>
      </Card>

      {selectedContentId ? (
        <>
          {/*<Card className="w-80" caption="Versions">
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
          </Card>*/}
          {<DocumentVersion contentId={selectedContentId} />}
        </>
      ) : (
        <div> No document selected </div>
      )}
    </>
  );
}
