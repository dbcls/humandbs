import { utils, write } from "xlsx";

export type TableExportData = {
  headers: string[];
  rows: string[][];
};

export type TableExportFormat = "copy" | "csv" | "excel";

function toDelimitedText({ headers, rows }: TableExportData, delimiter: "," | "\t") {
  const escapeCsvValue = (value: string) => {
    if (/[,\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };

  const formatRow = (row: string[]) =>
    row.map((value) => (delimiter === "," ? escapeCsvValue(value) : value)).join(delimiter);

  return [headers, ...rows].map(formatRow).join("\n");
}

export function createTableExportResponse(
  data: TableExportData,
  filename: string,
  format: TableExportFormat,
) {
  if (format === "copy") {
    return new Response(toDelimitedText(data, "\t"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (format === "csv") {
    return new Response(toDelimitedText(data, ","), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  const worksheet = utils.aoa_to_sheet([data.headers, ...data.rows]);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, "Sheet1");

  return new Response(write(workbook, { bookType: "xlsx", type: "buffer" }), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}
