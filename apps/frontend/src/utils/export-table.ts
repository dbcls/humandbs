import { utils, writeFile } from "xlsx";

export type TableExportData = {
  headers: string[];
  rows: string[][];
};

export function copyTableData({ headers, rows }: TableExportData): void {
  const lines = [headers, ...rows].map((row) => row.join("\t")).join("\n");
  navigator.clipboard.writeText(lines);
}

export function downloadCsv({ headers, rows }: TableExportData, filename: string): void {
  const escapeSpecialChars = (value: string) => {
    if (/[,"\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const lines = [headers, ...rows].map((row) => row.map(escapeSpecialChars).join(",")).join("\n");

  const blob = new Blob([lines], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export function downloadExcel({ headers, rows }: TableExportData, filename: string): void {
  const worksheet = utils.aoa_to_sheet([headers, ...rows]);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, "Sheet1");
  writeFile(workbook, `${filename}.xlsx`);
}
