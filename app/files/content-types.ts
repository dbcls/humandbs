/**
 * The Content-Type an object is stored with when nothing else supplies one
 * (`scripts/common-assets.ts`, copying in files that have no browser-guessed
 * type of their own). The proxy reads that stored Content-Type back to decide
 * inline display (`docker/nginx/default.conf`), which is why SVG is
 * deliberately absent here — it is markup, and an inline one would run on the
 * portal's own origin.
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

/** What Content-Type to store a file under, by its name. Unknown names get the generic octet-stream type. */
export function contentTypeOf(name: string): string {
  const dot = name.lastIndexOf(".")
  return (dot === -1 ? undefined : CONTENT_TYPES[name.slice(dot).toLowerCase()]) ?? "application/octet-stream"
}
