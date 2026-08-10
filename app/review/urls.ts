/**
 * The addresses a share link opens.
 *
 * The token is a path segment rather than a query parameter so that the whole
 * address is one thing to copy and to revoke. `/preview` is reserved in
 * `SCREEN_PATHS`, and these pages take a language prefix like every other page:
 * a data provider reads Japanese, a reviewer abroad reads English, and the
 * draft is the same draft.
 */

export function previewPath(token: string): string {
  return `/preview/${encodeURIComponent(token)}`
}

export function previewDatasetPath(token: string, datasetId: string): string {
  return `${previewPath(token)}/dataset/${encodeURIComponent(datasetId)}`
}
