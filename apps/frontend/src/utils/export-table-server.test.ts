import { describe, expect, test } from "bun:test";

import { createTableExportResponse } from "./export-table-server";

const table = {
  headers: ["ID", "Title"],
  rows: [["1", 'A, "quoted" title']],
};

describe("createTableExportResponse", () => {
  test("creates tab-separated text for clipboard copy", async () => {
    const response = createTableExportResponse(table, "records", "copy");

    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe('ID\tTitle\n1\tA, "quoted" title');
  });

  test("creates an escaped CSV attachment", async () => {
    const response = createTableExportResponse(table, "records", "csv");

    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="records.csv"');
    expect(await response.text()).toBe('ID,Title\n1,"A, ""quoted"" title"');
  });

  test("creates a non-empty Excel attachment", async () => {
    const response = createTableExportResponse(table, "records", "excel");

    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="records.xlsx"');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});
