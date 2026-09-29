/**
 * The API described for a program that reads text rather than running script:
 * what `/api/docs` holds until Swagger UI draws over it, and `/llms.txt`.
 *
 * **Both are written from the endpoint list** (`./endpoints.ts`), the way the
 * OpenAPI document is, so neither can name an address the application does not
 * serve or leave out one it does.
 */

import { messagesFor } from "~/i18n/messages"

import { API_ENDPOINTS, DOCS_PATH, OPENAPI_PATH } from "./endpoints"
import { API_SUMMARY, API_TITLE, documentPath } from "./openapi"

export interface ListedEndpoint {
  method: "GET"
  /** As the OpenAPI document spells it, parameters in braces. */
  path: string
  summary: string
}

export function listedEndpoints(): ListedEndpoint[] {
  return API_ENDPOINTS.map((endpoint) => ({ method: "GET", path: documentPath(endpoint.path), summary: endpoint.summary }))
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
}

/** What `/api/docs` holds before Swagger UI has drawn the document, which is all a program running no script reads. */
export function docsText(): string {
  return [
    `<h1>${escapeHtml(API_TITLE)}</h1>`,
    `<p>${escapeHtml(API_SUMMARY)}</p>`,
    `<p>Every endpoint, its parameters, the query language and the shape of each answer are in the OpenAPI document at <a href="/${OPENAPI_PATH}">/${OPENAPI_PATH}</a>. This page draws that document with Swagger UI, which runs in the browser.</p>`,
    "<h2>Endpoints</h2>",
    "<ul>",
    ...listedEndpoints().map((one) => `<li><code>${one.method} ${escapeHtml(one.path)}</code>: ${escapeHtml(one.summary)}</li>`),
    "</ul>",
  ].join("\n")
}

/**
 * `/llms.txt`: the site in a line, and where a program reads and searches it.
 * Written against the deployment's own origin, like `robots.txt`.
 *
 * **It sends a program to the API rather than to the listings.** A listing
 * page counts every value of its refinement panel for the one search it shows,
 * which the API's search does not, and its addresses with a condition written
 * are closed to crawlers.
 */
export function llmsText(origin: string): string {
  const at = (path: string) => `${origin}/${path}`
  return [
    `# ${messagesFor("en").siteName}`,
    "",
    "> A platform that promotes the sharing and use of diverse human-derived datasets, balanced with a commitment to protecting personal privacy. It publishes each research that produced human data, in numbered versions, together with the datasets belonging to it, in Japanese and English.",
    "",
    "Programs should read and search the portal through its JSON API rather than its pages. The API answers the same queries as the research and dataset listings, returns every value typed and in both languages, and streams the whole published set as NDJSON.",
    "",
    "## API",
    "",
    `- [OpenAPI document](${at(OPENAPI_PATH)}): every endpoint, its parameters, the query language and the shape of each answer`,
    `- [API documentation](${at(DOCS_PATH)}): the same document, drawn by Swagger UI`,
    "",
    "## Endpoints",
    "",
    ...listedEndpoints().map((one) => `- \`${one.method} ${one.path}\`: ${one.summary}`),
    "",
  ].join("\n")
}
