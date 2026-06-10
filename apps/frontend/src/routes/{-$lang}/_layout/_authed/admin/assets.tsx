import { createFileRoute } from "@tanstack/react-router";

import { Suspense } from "react";

import { Card } from "@/components/Card";

import { AssetsBrowser, AssetsBrowserFallback } from "./-components/AssetsBrowser";

export { AssetsPanel } from "./-components/AssetsPanel";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/assets")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Card
      className="flex h-full min-w-0 flex-1 flex-col"
      containerClassName="flex-1 flex flex-col"
      caption="Assets"
    >
      <Suspense fallback={<AssetsBrowserFallback />}>
        <AssetsBrowser />
      </Suspense>
    </Card>
  );
}
