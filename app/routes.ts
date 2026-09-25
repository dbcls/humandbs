import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes"

import {
  API_ENDPOINTS,
  DOCS_FILE,
  DOCS_PATH,
  OPENAPI_FILE,
  OPENAPI_PATH,
} from "./api/endpoints"

/**
 * The same pages are registered twice, once without a prefix and once under
 * `/en`, because the language is part of the address and Japanese is the one
 * without a prefix (`app/public/urls.ts`). Registering them under an optional
 * `:lang?` segment would make `/hum0001` — the address DDBJ Search links to —
 * indistinguishable from a language prefix.
 *
 * The catch-all is last and takes what is left: the bare hum labels, the
 * addresses the old Joomla site published, `/ja/…` (the same page as the
 * unprefixed one, which it redirects to), and every document slug. Slugs have
 * depth (`guidelines/data-sharing-guidelines`), so they cannot be a segment
 * pattern; the routes above own their addresses, and a document that took one
 * of them would be unreachable (`SCREEN_PATHS` in `app/public/urls.ts`).
 *
 * Registering a file twice needs an explicit id, and **an id must not contain a
 * slash**: the server build resolves a module from it, so `ja/research` sends it
 * looking for a file that is not there and every route responds with 500.
 */
function pages(scope: string) {
  return [
    index("routes/home.tsx", { id: `${scope}-home` }),
    route("news", "routes/news.tsx", { id: `${scope}-news` }),
    route("news/:newsId", "routes/news-item.tsx", { id: `${scope}-news-item` }),
    route("data-submission", "routes/data-submission.tsx", { id: `${scope}-data-submission` }),
    route("data-use", "routes/data-use.tsx", { id: `${scope}-data-use` }),
    route("contact-us", "routes/contact-us.tsx", { id: `${scope}-contact-us` }),
    route("research", "routes/research-list.tsx", { id: `${scope}-research-list` }),
    // Before the identity, so that `export` is a file rather than a research
    // that could never be found. A hum label cannot spell it.
    route("research/export", "routes/research-export.ts", { id: `${scope}-research-export` }),
    route("research/:humId", "routes/research.tsx", { id: `${scope}-research` }),
    route("research/:humId/versions", "routes/research-versions.tsx", { id: `${scope}-versions` }),
    route("research/:humId/:version", "routes/research-version.tsx", { id: `${scope}-version` }),
    route("cart", "routes/cart.tsx", { id: `${scope}-cart` }),
    route("cart/rows", "routes/cart-rows.ts", { id: `${scope}-cart-rows` }),
    route("dataset", "routes/dataset-list.tsx", { id: `${scope}-dataset-list` }),
    route("dataset/export", "routes/dataset-export.ts", { id: `${scope}-dataset-export` }),
    route("dataset/:datasetId", "routes/dataset.tsx", { id: `${scope}-dataset` }),
    route("preview/:token", "routes/preview.tsx", { id: `${scope}-preview` }),
    route(
      "preview/:token/dataset/:datasetId",
      "routes/preview-dataset.tsx",
      { id: `${scope}-preview-dataset` },
    ),
  ]
}

/**
 * The management area, registered once.
 *
 * **It has no language prefix.** These screens are written for the people
 * who run the portal and exist in Japanese only, so `/en/admin` would be a
 * second address serving the same screens in the same words (`public/urls.ts`
 * の `href`). The public pages above are registered twice; this is not.
 *
 * Everything under `/admin` is inside one layout, so that the area's frame —
 * the width, the destinations, the demand for a session — is set once rather
 * than by each screen (`routes/admin-layout.tsx`).
 */
const management = [
  layout("routes/admin-layout.tsx", { id: "admin-layout" }, [
    route("admin", "routes/admin.tsx", { id: "admin" }),
    route(
      "admin/experiment-fields",
      "routes/admin-experiment-fields.tsx",
      { id: "admin-experiment-fields" },
    ),
    route(
      "admin/experiment-fields/:key",
      "routes/admin-experiment-field-terms.tsx",
      { id: "admin-experiment-field-terms" },
    ),
    route("admin/documents", "routes/admin-documents.tsx", { id: "admin-documents" }),
    // Before the identity, so that `series` is a screen rather than a document
    // that could never be found.
    route(
      "admin/documents/series/:seriesId",
      "routes/admin-document-series.tsx",
      { id: "admin-document-series" },
    ),
    // Before the identity, so that `preview` is a way rather than a document
    // that could never be found.
    route("admin/documents/preview", "routes/admin-document-preview.ts"),
    route(
      "admin/documents/:documentId",
      "routes/admin-document.tsx",
      { id: "admin-document" },
    ),
    route(
      "admin/alert",
      "routes/admin-alert.tsx",
      { id: "admin-alert" },
    ),
    route(
      "admin/news",
      "routes/admin-news.tsx",
      { id: "admin-news" },
    ),
    route(
      "admin/news/:newsId",
      "routes/admin-news-item.tsx",
      { id: "admin-news-item" },
    ),
    route(
      "admin/files",
      "routes/admin-files.tsx",
      { id: "admin-files" },
    ),
    route("admin/research", "routes/admin-research-list.tsx", { id: "admin-research-list" }),
    // Before the identity, so that `upstream` is a screen rather than a research
    // that could never be found.
    route(
      "admin/research/upstream",
      "routes/admin-research-upstream.tsx",
      { id: "admin-research-upstream" },
    ),
    route(
      "admin/research/upstream/:applicationId",
      "routes/admin-upstream-branch.tsx",
      { id: "admin-upstream-branch" },
    ),
    route("admin/research/:researchId", "routes/admin-research.tsx", { id: "admin-research" }),
    route(
      "admin/research/:researchId/files",
      "routes/admin-research-files.tsx",
      { id: "admin-research-files" },
    ),
    route(
      "admin/research/:researchId/version/:number/dataset",
      "routes/admin-version-datasets.tsx",
      { id: "admin-version-datasets" },
    ),
    route(
      "admin/research/:researchId/draft/:draftId",
      "routes/admin-draft.tsx",
      { id: "admin-draft" },
    ),
    route(
      "admin/research/:researchId/draft/:draftId/import",
      "routes/admin-draft-import.tsx",
      { id: "admin-draft-import" },
    ),
    route(
      "admin/research/:researchId/draft/:draftId/publish",
      "routes/admin-draft-publish.tsx",
      { id: "admin-draft-publish" },
    ),
    route(
      "admin/research/:researchId/draft/:draftId/review",
      "routes/admin-draft-review.tsx",
      { id: "admin-draft-review" },
    ),
    route(
      "admin/research/:researchId/draft/:draftId/dataset",
      "routes/admin-draft-datasets.tsx",
      { id: "admin-draft-datasets" },
    ),
    route(
      "admin/research/:researchId/draft/:draftId/dataset/upstream",
      "routes/admin-draft-dataset-upstream.tsx",
      { id: "admin-draft-dataset-upstream" },
    ),
    route(
      "admin/research/:researchId/draft/:draftId/dataset/:datasetId",
      "routes/admin-draft-dataset.tsx",
      { id: "admin-draft-dataset" },
    ),
    /**
     * The assistant. **The screen is registered here and the service it talks
     * to is not registered at all** — it responds under the proxy below, which
     * is the only address that reaches it.
     */
    route("admin/assistant", "routes/admin-assistant.tsx", { id: "admin-assistant" }),
  ]),
]

/**
 * What an open editor talks to rather than navigates to. They are registered
 * once because they respond with data rather than with a page, so the language
 * prefix has nothing to change about them.
 */
const editing = [
  route("admin/research/:researchId/draft/:draftId/comments", "routes/admin-draft-comments.ts"),
  route("admin/research/:researchId/draft/:draftId/name", "routes/admin-draft-name.ts"),
  route("admin/research/:researchId/draft/:draftId/page", "routes/admin-draft-page.ts"),
  route(
    "admin/research/:researchId/draft/:draftId/dataset/:datasetId/page",
    "routes/admin-draft-dataset-page.ts",
  ),
  route("admin/terms", "routes/admin-terms.ts"),
  route("admin/research/:researchId/files/upload", "routes/admin-research-files-upload.ts"),
  route("admin/research/:researchId/files/download", "routes/admin-research-files-download.ts"),
  route("admin/files/upload", "routes/admin-files-upload.ts"),
  /**
   * The assistant's API, handed on unchanged to a service that holds no
   * authorisation of its own. **Registered once**, beside the others here:
   * what it responds with is the service's, not interface text, so a language
   * prefix has nothing to change about it.
   */
  route("admin/assistant/api/*", "routes/admin-assistant-api.ts"),
]

/**
 * Signing in has no language prefix. These are not pages anybody reads, and the
 * callback address is registered with Keycloak, which admits one spelling.
 */
const auth = [
  route("auth/login", "routes/auth-login.ts"),
  route("auth/callback", "routes/auth-callback.ts"),
  route("auth/logout", "routes/auth-logout.ts"),
]

/**
 * The JSON API, and the page that draws its document. **The addresses come from
 * `app/api/endpoints.ts`**, which is the
 * same list the OpenAPI document is generated from, so a route and its entry in
 * the document cannot describe different addresses.
 *
 * No language prefix: an answer has both languages.
 */
const api = [
  ...API_ENDPOINTS.map((endpoint) => route(endpoint.path, endpoint.file)),
  route(OPENAPI_PATH, OPENAPI_FILE),
  route(DOCS_PATH, DOCS_FILE),
]

/**
 * The URL lists of a research's and a dataset's public files, registered once:
 * like a file's own address (`filePath`), a list is the same in both languages.
 * A static last segment ranks above `research/:humId/:version`, so `files.txt`
 * is never read as a version.
 */
const fileLists = [
  route("research/:humId/files.txt", "routes/research-file-list.ts"),
  route("dataset/:datasetId/files.txt", "routes/dataset-file-list.ts"),
]

export default [
  route("healthz", "routes/healthz.ts"),
  ...auth,
  ...api,
  ...fileLists,
  ...editing,
  ...management,
  ...pages("ja"),
  ...prefix("en", pages("en")),
  route("*", "routes/document.tsx"),
] satisfies RouteConfig
