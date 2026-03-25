import { Table, SortHeader } from "@/components/Table";
import { Button } from "@/components/ui/button";
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
  humId: string;
  research: ResearchData;
  onSelectDataset: (datasetId: string) => void;
  onAddNew: () => void;
}

export function ResearchDatasetsTab({
  humId,
  research,
  onSelectDataset,
  onAddNew,
}: ResearchDatasetsTabProps) {
  const queryClient = useQueryClient();
  const { openConfirmation } = useConfirmationStore();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { can: canCreate } = useCan({
    resource: "datasets",
    action: "create",
    params: { research },
  });
  const { can: canDelete } = useCan({
    resource: "datasets",
    action: "delete",
    params: { research },
  });

  const { mutate: deleteDataset } = useMutation({
    mutationFn: (datasetId: string) =>
      $deleteDataset({ data: { datasetId } }),
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

  const columns = useMemo<ColumnDef<Dataset>[]>(() => {
    const cols: ColumnDef<Dataset>[] = [
      {
        id: "datasetId",
        accessorKey: "datasetId",
        header: (ctx) => <SortHeader ctx={ctx} label="Dataset ID" />,
        cell: (ctx) => (
          <span className="font-mono text-xs">
            {ctx.getValue() as string}
          </span>
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
      {deleteError && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-danger">
          {deleteError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <nav className="text-sm text-gray-500">
          <span className="font-medium text-gray-800">Datasets</span>
        </nav>
        <Button
          type="button"
          size="slim"
          variant="outline"
          disabled={!canCreate}
          onClick={onAddNew}
        >
          Add new dataset
        </Button>
      </div>

      {datasets.length === 0 ? (
        <p className="text-sm text-gray-400">No datasets yet.</p>
      ) : (
        <div className="overflow-auto">
          <Table
            className="text-sm"
            columns={columns as ColumnDef<Record<string, unknown>>[]}
            data={datasets as unknown as Record<string, unknown>[]}
            onRowClick={(row) =>
              onSelectDataset((row as unknown as Dataset).datasetId)
            }
          />
        </div>
      )}
    </div>
  );
}
