/**
 * What the proxy is allowed to show inline is decided by these: an image or a
 * PDF is shown, everything else is downloaded. SVG is deliberately absent —
 * it is markup, and an inline one would run on the portal's own origin.
 */
export const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".zip": "application/zip",
}

/** What a file is sent as, by its name. Anything unknown is downloaded. */
export function contentTypeOf(name: string): string {
  const dot = name.lastIndexOf(".")
  return (dot === -1 ? undefined : CONTENT_TYPES[name.slice(dot).toLowerCase()]) ?? "application/octet-stream"
}
