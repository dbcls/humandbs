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

/**
 * Whether an address is a share link's page. **Read from the path**, for the
 * same reason as `isAdminPath`: the document's layout decides what the page
 * wears before any route has answered. The path handed in has had its language
 * prefix taken off (`public/urls.ts` の `readLocale`).
 */
export function isPreviewPath(path: string): boolean {
  return path === "/preview" || path.startsWith("/preview/")
}
