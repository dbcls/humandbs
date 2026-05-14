import { createFileRoute } from "@tanstack/react-router";

import { DataTransferPage } from "./-components/DataTransferPage";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/data-transfer",
)({
  component: RouteComponent,
});

function RouteComponent() {
  return <DataTransferPage />;
}
