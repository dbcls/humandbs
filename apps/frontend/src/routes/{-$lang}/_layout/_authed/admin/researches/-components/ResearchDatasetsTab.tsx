import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { useTranslations } from "use-intl";

import { useState } from "react";

import type { ResearchDetailResponse } from "@humandbs/backend/types";

import { SortHeader, Table } from "@/components/Table";
import { useCan } from "@/hooks/useCan";
import { $deleteDataset } from "@/serverFunctions/datasets";
import useConfirmationStore from "@/stores/confirmationStore";

import { AdminStatusMessage } from "../../-components/AdminStatusMessage";

type ResearchData = ResearchDetailResponse["data"];
type Dataset = NonNullable<ResearchData["datasets"]>[number];

interface ResearchDatasetsTabProps {
  research: ResearchData;
  onSelectDataset: (datasetId: string) => void;
}

export function ResearchDatasetsTab({ research, onSelectDataset }: ResearchDatasetsTabProps) {
  const queryClient = useQueryClient();
  const { openConfirmation } = useConfirmationStore();
  const tResearches = useTranslations("admin.researches");
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
      title: tResearches("delete-dataset-title"),
      description: tResearches("delete-dataset-description", { name: datasetId }),
      actionLabel: "Delete",
      onAction: () => deleteDataset(datasetId),
    });
  }

  const datasets = research.datasets ?? [];

  const columns: ColumnDef<Dataset>[] = [
    {
      id: "datasetId",
      accessorKey: "datasetId",
      header: (ctx) => <SortHeader ctx={ctx} label="Dataset ID" />,
      cell: (ctx) => <span className="font-mono text-xs">{ctx.getValue() as string}</span>,
      size: 14,
    },
    {
      id: "criteria",
      accessorKey: "criteria",
      header: (ctx) => <SortHeader ctx={ctx} label="Criteria" />,
      cell: (ctx) => <span className="text-xs">{ctx.getValue() as string}</span>,
      size: 18,
    },
    {
      id: "releaseDate",
      accessorKey: "releaseDate",
      header: (ctx) => <SortHeader ctx={ctx} label="Release Date" />,
      cell: (ctx) => <span className="text-xs">{ctx.getValue() as string}</span>,
      size: 11,
    },
    {
      id: "version",
      accessorKey: "version",
      header: (ctx) => <SortHeader ctx={ctx} label="Version" />,
      cell: (ctx) => <span className="font-mono text-xs">{ctx.getValue() as string}</span>,
      size: 8,
    },
    {
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
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {deleteError ? <AdminStatusMessage>{deleteError}</AdminStatusMessage> : null}

      {datasets.length === 0 ? (
        <p className="text-gray-400 text-sm">{tResearches("no-datasets")}</p>
      ) : (
        <div className="overflow-auto">
          <Table
            className="text-sm"
            columns={columns}
            data={datasets}
            onRowClick={(row) => onSelectDataset((row as unknown as Dataset).datasetId)}
            columnVisibility={{ actions: canDelete }}
          />
        </div>
      )}
    </div>
  );
}
