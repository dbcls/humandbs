async function throwForFailedExport(response: Response) {
  if (response.ok) return;
  throw new Error((await response.text()) || "Failed to export table data.");
}

export async function copyExportResponse(response: Response): Promise<void> {
  await throwForFailedExport(response);
  await navigator.clipboard.writeText(await response.text());
}

export async function downloadExportResponse(response: Response): Promise<void> {
  await throwForFailedExport(response);

  const blob = await response.blob();
  const filename = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1];
  if (!filename) throw new Error("Export response did not include a filename.");

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
