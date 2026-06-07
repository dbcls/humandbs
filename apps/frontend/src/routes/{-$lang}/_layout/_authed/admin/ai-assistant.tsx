import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAssistantApplicationsQueryOptions } from "@/serverFunctions/researches";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/ai-assistant")({
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(getAssistantApplicationsQueryOptions());
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { data, isFetching, refetch } = useQuery(getAssistantApplicationsQueryOptions());

  const applications = data?.tasks ?? [];
  const total = data?.count ?? 0;

  return (
    <Card className="flex h-full min-w-0 flex-1 flex-col" caption="AI Assistant">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-muted-foreground text-sm">
          {isFetching ? "Loading..." : `${total} items`}
        </div>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
          Refresh
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px]">Application ID</TableHead>
              <TableHead className="w-[180px]">Type</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead className="w-[180px]">Created</TableHead>
              <TableHead className="w-[180px]">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.length > 0 ? (
              applications.map((application) => (
                <TableRow key={application.task_id}>
                  <TableCell className="font-medium">{application.task_id}</TableCell>
                  <TableCell>{application.application_type || "-"}</TableCell>
                  <TableCell>{application.status || "-"}</TableCell>
                  <TableCell>{application.created_at || "-"}</TableCell>
                  <TableCell>{application.updated_at || "-"}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No applications found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
