import { ResearchSearchBodySchema } from "@humandbs/backend/types";
import type { ResearchSearchResponse } from "@humandbs/backend/types";
import {
  type QueryKey,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, functionalUpdate } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  type SortingState,
  type Updater,
  useReactTable,
} from "@tanstack/react-table";
import {
  startTransition,
  Suspense,
  useCallback,
  useMemo,
  useState,
} from "react";

import { Card } from "@/components/Card";
import { Pagination } from "@/components/Pagination";
import { SortHeader, Table } from "@/components/Table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/config/i18n";
import { useFilters } from "@/hooks/useFilters";
import {
  $deleteResearch,
  getResearchesQueryOptions,
} from "@/serverFunctions/researches";
import useConfirmationStore from "@/stores/confirmationStore";

import { CreateResearchDialog } from "./-CreateResearchDialog";
import { UpdateResearchDialog } from "./-UpdateResearchDialog";

const searchSchema = ResearchSearchBodySchema.omit({
  lang: true,
  includeFacets: true,
});

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/researches/",
)({
  component: RouteComponent,
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps, context }) => {
    context.queryClient.ensureQueryData(
      getResearchesQueryOptions({ ...deps, lang: context.lang }),
    );
  },
});

interface DeleteOptimisticContext {
  previousLists: [QueryKey, ResearchSearchResponse | undefined][];
}

function RouteComponent() {
  return (
    <Card
      className="flex h-full flex-1 flex-col"
      caption="Researches"
      containerClassName="flex flex-1 flex-col overflow-hidden"
    >
      <div className="flex justify-between pb-2">
        <CreateResearchDialog />
      </div>
      <CardContent />
    </Card>
  );
}

function CardContent() {
  const { lang } = Route.useRouteContext();
  const search = Route.useSearch();
  const { setFilters } = useFilters(Route.id);
  const queryClient = useQueryClient();
  const { openConfirmation } = useConfirmationStore();
  const [editingHumId, setEditingHumId] = useState<string | null>(null);

  const sorting = useMemo(() => {
    if (!search.sort) return [];
    return [{ id: search.sort, desc: search.order === "desc" }];
  }, [search.sort, search.order]);

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const sortingState: SortingState = [
        { id: search.sort ?? "humId", desc: search.order === "desc" },
      ];
      const newState = functionalUpdate(updater, sortingState);

      startTransition(() => {
        setFilters({
          sort: newState[0]?.id,
          order: newState[0]?.desc ? "desc" : "asc",
        });
      });
    },
    [setFilters, search],
  );
  const handleEdit = useCallback((humId: string) => {
    setEditingHumId(humId);
  }, []);
  const handleCloseEdit = useCallback(() => {
    setEditingHumId(null);
  }, []);

  const { mutate: deleteResearch } = useMutation<
    void,
    Error,
    string,
    DeleteOptimisticContext
  >({
    mutationFn: async (humId) => {
      const result = await $deleteResearch({ data: { humId } });
      if (!result.ok && result.code !== "NOT_FOUND") {
        throw new Error(result.error);
      }
    },
    onMutate: async (humId) => {
      await queryClient.cancelQueries({ queryKey: ["researches", "list"] });

      const previousLists = queryClient.getQueriesData<ResearchSearchResponse>({
        queryKey: ["researches", "list"],
      });

      queryClient.setQueriesData<ResearchSearchResponse>(
        { queryKey: ["researches", "list"] },
        (oldData) => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            data: oldData.data.filter((research) => research.humId !== humId),
          };
        },
      );

      return { previousLists };
    },
    onError: (_error, _humId, context) => {
      context?.previousLists.forEach(([queryKey, previousData]) => {
        queryClient.setQueryData(queryKey, previousData);
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["researches", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["researches", "byId"] });
    },
  });

  const handleDelete = useCallback(
    (humId: string) => {
      openConfirmation({
        title: "Delete Research",
        description: `are you really want to delete research ${humId} ?`,
        actionLabel: "Delete",
        onAction: () => {
          deleteResearch(humId);
        },
      });
    },
    [deleteResearch, openConfirmation],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <Suspense fallback={<TableSkeleton />}>
          <ResearchTable
            lang={lang}
            sorting={sorting}
            onSortingChange={handleSortingChange}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </Suspense>
      </div>
      <Suspense>
        <TablePagination lang={lang} />
      </Suspense>
      <UpdateResearchDialog
        lang={lang}
        humId={editingHumId}
        onClose={handleCloseEdit}
      />
    </div>
  );
}

function ResearchTable({
  lang,
  sorting,
  onSortingChange,
  onEdit,
  onDelete,
}: {
  lang: Locale;
  sorting: SortingState;
  onSortingChange: (updater: Updater<SortingState>) => void;
  onEdit: (humId: string) => void;
  onDelete: (humId: string) => void;
}) {
  const search = Route.useSearch();
  const { data: researchesData } = useSuspenseQuery(
    getResearchesQueryOptions({ ...search, lang }),
  );
  const columns = useMemo(
    () => getColumns(onEdit, onDelete),
    [onDelete, onEdit],
  );

  return (
    <Table
      className="text-sm"
      columns={columns}
      data={researchesData.data}
      sorting={sorting}
      onSortingChange={onSortingChange}
    />
  );
}

function TablePagination({ lang }: { lang: Locale }) {
  const search = Route.useSearch();
  const { data: researchesData } = useSuspenseQuery(
    getResearchesQueryOptions({ ...search, lang }),
  );
  return <Pagination pagination={researchesData.meta.pagination} />;
}

function TableSkeleton() {
  const columns = useMemo(
    () =>
      getColumns(
        () => {},
        () => {},
      ),
    [],
  );
  const table = useReactTable({
    data: [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    defaultColumn: { maxSize: 20, minSize: 5 },
    state: { sorting: [] },
    onSortingChange: () => {},
    manualSorting: true,
  });

  return (
    <table className="w-full table-fixed align-top text-sm">
      <thead className="text-white">
        {table.getHeaderGroups().map((headerGroup) => (
          <tr
            key={headerGroup.id}
            className="from-secondary-light to-secondary-lighter rounded bg-linear-to-r text-left"
          >
            {headerGroup.headers.map((header) => (
              <th
                key={header.id}
                className="p-2 first-of-type:rounded-l last-of-type:rounded-r"
                style={{ width: `${header.getSize()}rem` }}
              >
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {Array.from({ length: 8 }).map((_, i) => (
          <tr key={i}>
            {table.getAllColumns().map((col) => (
              <td
                key={col.id}
                className="border-foreground-light/50 border-b-2 p-2"
              >
                <Skeleton className="h-4 w-full" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const columnHelper =
  createColumnHelper<ResearchSearchResponse["data"][number]>();

function getColumns(
  onEdit: (humId: string) => void,
  onDelete: (humId: string) => void,
) {
  return [
    columnHelper.accessor("humId", {
      id: "humId",
      header: (ctx) => <SortHeader ctx={ctx} label="Research ID" />,
      cell: (ctx) => <span className="font-mono">{ctx.getValue()}</span>,
      size: 15,
    }),
    columnHelper.accessor("datasetIds", {
      id: "datasets",
      header: "Datasets",
      cell: (ctx) => (
        <ul>
          {ctx.row.original.datasetIds.map((datasetId) => (
            <li key={datasetId} className="font-mono text-xs">
              {datasetId}
            </li>
          ))}
        </ul>
      ),
      size: 15,
    }),
    columnHelper.accessor("title", {
      id: "title",
      header: (ctx) => <SortHeader ctx={ctx} label="Title" />,
      cell: (ctx) => ctx.getValue(),
    }),
    columnHelper.accessor((row) => row.versions[0], {
      id: "datePublished",
      header: (ctx) => <SortHeader ctx={ctx} label="Date Published" />,
      size: 10,
      cell: (ctx) => {
        const v = ctx.getValue();
        if (!v) return null;
        return (
          <span>
            {v.releaseDate}
            <span className="text-xs text-foreground-light">({v.version})</span>
          </span>
        );
      },
    }),
    columnHelper.accessor((row) => row.versions[row.versions.length - 1], {
      id: "dateModified",
      header: (ctx) => <SortHeader ctx={ctx} label="Date Modified" />,
      size: 10,
      cell: (ctx) => {
        const v = ctx.getValue();
        if (!v) return null;
        return (
          <span>
            {v.releaseDate}
            <span className="text-xs text-foreground-light">({v.version})</span>
          </span>
        );
      },
    }),
    columnHelper.accessor("criteria", {
      id: "criteria",
      header: "Criteria",
      cell: (ctx) => <span className="text-xs">{ctx.getValue()}</span>,
      size: 15,
    }),
    columnHelper.display({
      id: "actions",
      header: "Actions",
      size: 8,
      cell: (ctx) => (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="slim"
            onClick={() => {
              onEdit(ctx.row.original.humId);
            }}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="slim"
            className="text-danger"
            onClick={() => {
              onDelete(ctx.row.original.humId);
            }}
          >
            Delete
          </Button>
        </div>
      ),
    }),
  ];
}
