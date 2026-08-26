import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  DatasetSearchBody,
  DatasetSearchResponse,
  ResearchSearchBody,
} from "@humandbs/backend/types";
import { DatasetSearchBodySchema, ResearchSearchBodySchema } from "@humandbs/backend/types";

import { messages } from "@/config/messages";
import type { ResearchSearchResponseWithTypedCriteria } from "@/lib/types";
import { requestSignalMiddleware } from "@/middleware/requestSignalMiddleware";
import { api } from "@/services/backend";
import type { TableExportData, TableExportFormat } from "@/utils/export-table-server";
import { createTableExportResponse } from "@/utils/export-table-server";
import { $$getJWT } from "@/utils/jwt-helpers";

const tableExportFormatSchema = z.enum(["copy", "csv", "excel"]);

const searchExportSchema = <T extends z.ZodObject>(search: T) =>
  z.object({ format: tableExportFormatSchema, search });

const datasetSearchExportSchema = searchExportSchema(
  DatasetSearchBodySchema.omit({ page: true, limit: true, includeFacets: true }),
);
const researchSearchExportSchema = searchExportSchema(
  ResearchSearchBodySchema.omit({ page: true, limit: true, includeFacets: true }),
);

type DatasetExportSearch = Omit<DatasetSearchBody, "page" | "limit" | "includeFacets">;
type ResearchExportSearch = Omit<ResearchSearchBody, "page" | "limit" | "includeFacets">;

function datasetTableData(
  datasets: DatasetSearchResponse["data"],
  search: DatasetExportSearch,
): TableExportData {
  const labels = messages[search.lang].Dataset;
  const columns: {
    header: string;
    value: (row: DatasetSearchResponse["data"][number]) => string;
  }[] = [
    { header: labels.datasetId, value: (row) => row.datasetId },
    { header: labels.releaseDate, value: (row) => row.releaseDate ?? "" },
    { header: labels.typeOfData, value: (row) => row.typeOfData?.[search.lang] ?? "" },
    {
      header: labels.experiments,
      value: (row) =>
        row.experiments
          .map((experiment) => experiment.header?.[search.lang]?.text ?? "")
          .filter(Boolean)
          .join("; "),
    },
    { header: labels.criteria, value: (row) => row.criteria ?? "" },
  ];

  return {
    headers: columns.map((column) => column.header),
    rows: datasets.map((dataset) => columns.map((column) => column.value(dataset))),
  };
}

function researchTableData(
  researches: ResearchSearchResponseWithTypedCriteria["data"],
  search: ResearchExportSearch,
): TableExportData {
  const labels = messages[search.lang]["Research-list"].fields;
  const columns: {
    header: string;
    value: (row: ResearchSearchResponseWithTypedCriteria["data"][number]) => string;
  }[] = [
    { header: messages[search.lang].Research["research-id"], value: (row) => row.humId },
    { header: labels.datasets.label, value: (row) => row.datasetIds.join(", ") },
    { header: labels.title.label, value: (row) => row.title[search.lang] ?? "" },
    {
      header: labels.datePublished.label,
      value: (row) => `${row.versions[0]?.releaseDate ?? ""} (${row.versions[0]?.version ?? ""})`,
    },
    {
      header: labels.dateModified.label,
      value: (row) =>
        `${row.versions.at(-1)?.releaseDate ?? ""} (${row.versions.at(-1)?.version ?? ""})`,
    },
    { header: labels.methods.label, value: (row) => row.methods ?? "" },
    { header: labels.typeOfData.label, value: (row) => row.typeOfData.join(", ") },
    { header: labels.platforms.label, value: (row) => row.platforms.join(", ") },
    { header: labels.targets.label, value: (row) => row.targets },
    { header: labels.criteria.label, value: (row) => row.criteria.join(", ") },
    { header: labels.dataProvider.label, value: (row) => row.dataProvider.join(", ") },
  ];

  return {
    headers: columns.map((column) => column.header),
    rows: researches.map((research) => columns.map((column) => column.value(research))),
  };
}

export const $exportDatasets = createServerFn({ method: "POST" })
  .middleware([requestSignalMiddleware])
  .inputValidator(datasetSearchExportSchema)
  .handler(async ({ data, context }) => {
    const datasets = await api.searchDatasetsAll(
      data.search,
      $$getJWT() ?? undefined,
      context.requestSignal,
    );
    return createTableExportResponse(
      datasetTableData(datasets, data.search),
      "dataset-list",
      data.format,
    );
  });

export const $exportResearches = createServerFn({ method: "POST" })
  .middleware([requestSignalMiddleware])
  .inputValidator(researchSearchExportSchema)
  .handler(async ({ data, context }) => {
    const researches = await api.searchResearchesAll(
      data.search,
      $$getJWT() ?? undefined,
      context.requestSignal,
    );
    return createTableExportResponse(
      researchTableData(researches, data.search),
      "research-list",
      data.format,
    );
  });

export type SearchExportFormat = TableExportFormat;
