import { Table, SortHeader } from "@/components/Table";
import { AdminStatusMessage } from "../-components/AdminStatusMessage";
import { useCan } from "@/hooks/useCan";
import { $deleteDataset } from "@/serverFunctions/datasets";
import useConfirmationStore from "@/stores/confirmationStore";
import type { ResearchDetailResponse } from "@humandbs/backend/types";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

type ResearchData = ResearchDetailResponse["data"];
type Dataset = NonNullable<ResearchData["datasets"]>[number];

interface ResearchDatasetsTabProps {
  research: ResearchData;
  onSelectDataset: (datasetId: string) => void;
}

export function ResearchDatasetsTab({
  research,
  onSelectDataset,
}: ResearchDatasetsTabProps) {
  const queryClient = useQueryClient();
  const { openConfirmation } = useConfirmationStore();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { can: canDelete } = useCan({
    resource: "datasets",
    action: "delete",
    params: { research },
  });

  const { mutate: deleteDataset } = useMutation({
    mutationFn: (datasetId: string) => $deleteDataset({ data: { datasetId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ["researches", "byId"] });
    },
  });

  function handleDelete(datasetId: string) {
    openConfirmation({
      title: "Delete dataset?",
      description: `This will permanently delete ${datasetId}. This action cannot be undone.`,
      actionLabel: "Delete",
      onAction: () => deleteDataset(datasetId),
    });
  }

  // TODO refactor - hide "actions" columns conditionally
  const columns = useMemo<ColumnDef<Dataset>[]>(() => {
    const cols: ColumnDef<Dataset>[] = [
      {
        id: "datasetId",
        accessorKey: "datasetId",
        header: (ctx) => <SortHeader ctx={ctx} label="Dataset ID" />,
        cell: (ctx) => (
          <span className="font-mono text-xs">{ctx.getValue() as string}</span>
        ),
        size: 14,
      },
      {
        id: "criteria",
        accessorKey: "criteria",
        header: (ctx) => <SortHeader ctx={ctx} label="Criteria" />,
        cell: (ctx) => (
          <span className="text-xs">{ctx.getValue() as string}</span>
        ),
        size: 18,
      },
      {
        id: "releaseDate",
        accessorKey: "releaseDate",
        header: (ctx) => <SortHeader ctx={ctx} label="Release Date" />,
        cell: (ctx) => (
          <span className="text-xs">{ctx.getValue() as string}</span>
        ),
        size: 11,
      },
      {
        id: "version",
        accessorKey: "version",
        header: (ctx) => <SortHeader ctx={ctx} label="Version" />,
        cell: (ctx) => (
          <span className="font-mono text-xs">{ctx.getValue() as string}</span>
        ),
        size: 8,
      },
    ];

    if (canDelete) {
      cols.push({
        id: "actions",
        header: "",
        cell: (ctx) => (
          <button
            type="button"
            className="text-danger hover:opacity-70 disabled:opacity-30"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(ctx.row.original.datasetId);
            }}
            title="Delete dataset"
          >
            <Trash2 className="size-4" />
          </button>
        ),
        size: 4,
      });
    }

    return cols;
  }, [canDelete]);

  const datasets = research.datasets ?? [];

  return (
    <div className="flex flex-col gap-4">
      {deleteError ? <AdminStatusMessage>{deleteError}</AdminStatusMessage> : null}

      {datasets.length === 0 ? (
        <p className="text-sm text-gray-400">No datasets yet.</p>
      ) : (
        <div className="overflow-auto">
          <Table
            className="text-sm"
            columns={columns}
            data={datasets}
            onRowClick={(row) =>
              onSelectDataset((row as unknown as Dataset).datasetId)
            }
          />
        </div>
      )}
    </div>
  );
}
