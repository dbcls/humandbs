import { createFileRoute } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { ChevronDown, ChevronsUpDown, ChevronUp, Search } from "lucide-react";

import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { Button } from "@/components/ui/button";
import { FA_ICONS } from "@/lib/faIcons";
import { useTranslations } from "use-intl";
import { $getResearchList } from "@/serverFunctions/mock/research";
import {
  Research,
  ResearchesQuerySchema,
  ResearchSummary,
} from "@humandbs/backend/types";
import { filterStringSchema, paginationSchema } from "@/utils/searchParams";
import { api } from "@/services/backend";

export const researchesSearchParamsSchema = ResearchesQuerySchema.omit({
  lang: true,
});

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/researches/"
)({
  component: RouteComponent,
  validateSearch: researchesSearchParamsSchema,
  loaderDeps: ({ search: { page, limit, sort, order } }) => ({
    page,
    limit,
    sort,
    order,
  }),

  loader: ({ deps, context }) =>
    api.getResearchListPaginated({ search: { ...deps, lang: context.lang } }),
});

function Caption() {
  const t = useTranslations("Research-list");

  const navigate = Route.useNavigate();

  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg">{t("research-list")}</h3>

      <div className="flex items-stretch gap-4">
        <div className="flex gap-1">
          <Button variant={"tableAction"} size={"tableAction"}>
            Copy
          </Button>
          <Button variant={"tableAction"} size={"tableAction"}>
            CSV
          </Button>
          <Button variant={"tableAction"} size={"tableAction"}>
            Excel
          </Button>
        </div>

        <Input
          type="text"
          placeholder="検索"
          beforeIcon={<Search size={22} />}
          // onKeyDown={(e) => {
          //   if (e.key === "Enter") {
          //     // Handle search logic here
          //     navigate({
          //       search: { filter: (e.target as HTMLInputElement).value },
          //     });
          //   }
          // }}
        />
      </div>
    </div>
  );
}

const columnHelper = createColumnHelper<Research>();

const columns = [
  columnHelper.accessor("humId", {
    id: "humId",
    header: (ctx) => {
      const sortDirection = ctx.column.getIsSorted();
      const sortIcon =
        sortDirection === "desc" ? (
          <ChevronDown size={18} />
        ) : sortDirection === "asc" ? (
          <ChevronUp size={18} />
        ) : (
          <ChevronsUpDown size={18} />
        );
      return (
        <div className="flex items-center whitespace-nowrap">
          <div>Research ID </div>
          <Button
            onClick={ctx.column.getToggleSortingHandler()}
            variant={"plain"}
            className="p-0"
          >
            {sortIcon}
          </Button>
        </div>
      );
    },
    cell: function Cell(ctx) {
      const researchIdWithVer = ctx.getValue();
      const researchId = researchIdWithVer.split(".")[0];
      const researchVer = researchIdWithVer.split(".")[1];
      return (
        <div>
          <Route.Link
            to="$researchId/$researchVer"
            params={{ researchId, researchVer }}
          >
            <TextWithIcon
              className="text-foreground-dark"
              icon={FA_ICONS.books}
            >
              {ctx.getValue()}
            </TextWithIcon>
          </Route.Link>
          <ul>
            <p> Datasets here ... </p>
            {/*{ctx.row.original.datasets.map((dataset) => (
              <li key={dataset}>
                <TextWithIcon
                  className="text-secondary"
                  icon={FA_ICONS.dataset}
                >
                  {dataset}
                </TextWithIcon>
              </li>
            ))}*/}
          </ul>
        </div>
      );
    },
    sortingFn: "alphanumeric",
  }),
  columnHelper.accessor("title", {
    id: "title",
    header: "研究題目",
    cell: (ctx) => ctx.getValue(),
  }),
  columnHelper.accessor("versions", {
    id: "versions",
    header: "Versions",
    cell: (ctx) =>
      ctx.renderValue()?.map((version) => (
        <span className="flex gap-2" key={version.version}>
          <span>{version.version}:</span>
          <span>{version.releaseDate.replaceAll(/-/g, "/")}</span>
        </span>
      )),
  }),
  columnHelper.accessor(() => {}, {
    id: "publicationDate",
    header: "公開日",
    cell: (ctx) => <> ... </>,
  }),
  columnHelper.accessor(() => {}, {
    id: "dataType",
    header: "データタイプ",
    cell: (ctx) => <>...</>,
  }),
  columnHelper.accessor(() => {}, {
    id: "methodology",
    header: "手法",
    cell: (ctx) => <>...</>,
  }),
  columnHelper.accessor(() => {}, {
    id: "instrument",
    header: "機器",
    cell: (ctx) => <>...</>,
  }),
  columnHelper.accessor(() => {}, {
    id: "subjects",
    header: "被験者",
    cell: (ctx) => <> ... </>,
    // ctx.getValue().map((participant) => (
    //   <div key={participant.content.join(",")}>
    //     <ul>
    //       {participant.content.map((content) => (
    //         <li key={content}>{content}</li>
    //       ))}
    //     </ul>
    //     {participant.type && (
    //       <p className="text-secondary text-sm">{participant.type}</p>
    //     )}
    //   </div>
    // )),
  }),
];
// table using Tanstack table:

function RouteComponent() {
  const { data, pagination } = Route.useLoaderData();

  const { page } = Route.useSearch();

  return (
    <Card caption={<Caption />}>
      <Table className="mt-4" columns={columns} data={data} />
      {/*Pagination*/}
      <Pagination totalPages={pagination.totalPages} page={page} />
    </Card>
  );
}

function Pagination({
  totalPages,
  page,
}: {
  totalPages: number;
  page: number;
}) {
  const navigate = Route.useNavigate();

  return (
    <div className="mt-4 flex justify-center gap-5">
      <button
        className="btn btn-sm btn-outline"
        onClick={() =>
          navigate({ search: (prev) => ({ page: prev.page - 1 }) })
        }
        disabled={page === 1}
      >
        Previous
      </button>
      <span>
        {page} / {totalPages}
      </span>
      <button
        className="btn btn-sm btn-outline"
        onClick={() =>
          navigate({ search: (prev) => ({ page: prev.page + 1 }) })
        }
        disabled={page === totalPages}
      >
        Next
      </button>
    </div>
  );
}
