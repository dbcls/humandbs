import { type RouteConfig, index, prefix, route } from "@react-router/dev/routes"

import { API_ENDPOINTS, OPENAPI_FILE, OPENAPI_PATH } from "./api/endpoints"

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
 * looking for a file that is not there and every route answers 500.
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
    route("research/:humId", "routes/research.tsx", { id: `${scope}-research` }),
    route("research/:humId/versions", "routes/research-versions.tsx", { id: `${scope}-versions` }),
    route("research/:humId/:version", "routes/research-version.tsx", { id: `${scope}-version` }),
    route("dataset", "routes/dataset-list.tsx", { id: `${scope}-dataset-list` }),
    route("dataset/:datasetId", "routes/dataset.tsx", { id: `${scope}-dataset` }),
    route("preview/:token", "routes/preview.tsx", { id: `${scope}-preview` }),
    route(
      "preview/:token/dataset/:datasetId",
      "routes/preview-dataset.tsx",
      { id: `${scope}-preview-dataset` },
    ),
    route("admin", "routes/admin.tsx", { id: `${scope}-admin` }),
    route("admin/catalog", "routes/admin-catalog.tsx", { id: `${scope}-admin-catalog` }),
    route(
      "admin/catalog/vocabulary/:code",
      "routes/admin-catalog-vocabulary.tsx",
      { id: `${scope}-admin-catalog-vocabulary` },
    ),
    route("admin/contents", "routes/admin-contents.tsx", { id: `${scope}-admin-contents` }),
    route(
      "admin/contents/document/:documentId",
      "routes/admin-contents-document.tsx",
      { id: `${scope}-admin-contents-document` },
    ),
    route(
      "admin/contents/news",
      "routes/admin-contents-news.tsx",
      { id: `${scope}-admin-contents-news` },
    ),
    route(
      "admin/contents/news/:newsId",
      "routes/admin-contents-news-item.tsx",
      { id: `${scope}-admin-contents-news-item` },
    ),
    route(
      "admin/contents/files",
      "routes/admin-contents-files.tsx",
      { id: `${scope}-admin-contents-files` },
    ),
    route("admin/research", "routes/admin-research-list.tsx", { id: `${scope}-admin-research-list` }),
    // Before the identity, so that `upstream` is a screen rather than a research
    // that could never be found.
    route(
      "admin/research/upstream",
      "routes/admin-research-upstream.tsx",
      { id: `${scope}-admin-research-upstream` },
    ),
    route("admin/research/:researchId", "routes/admin-research.tsx", { id: `${scope}-admin-research` }),
    route(
      "admin/research/:researchId/files",
      "routes/admin-research-files.tsx",
      { id: `${scope}-admin-research-files` },
    ),
    route(
      "admin/research/:researchId/draft/:draftId",
      "routes/admin-draft.tsx",
      { id: `${scope}-admin-draft` },
    ),
    route(
      "admin/research/:researchId/draft/:draftId/publish",
      "routes/admin-draft-publish.tsx",
      { id: `${scope}-admin-draft-publish` },
    ),
    route(
      "admin/research/:researchId/draft/:draftId/review",
      "routes/admin-draft-review.tsx",
      { id: `${scope}-admin-draft-review` },
    ),
    route(
      "admin/research/:researchId/draft/:draftId/dataset",
      "routes/admin-draft-datasets.tsx",
      { id: `${scope}-admin-draft-datasets` },
    ),
    route(
      "admin/research/:researchId/draft/:draftId/dataset/upstream",
      "routes/admin-draft-dataset-upstream.tsx",
      { id: `${scope}-admin-draft-dataset-upstream` },
    ),
    route(
      "admin/research/:researchId/draft/:draftId/dataset/:datasetId",
      "routes/admin-draft-dataset.tsx",
      { id: `${scope}-admin-draft-dataset` },
    ),
  ]
}

/**
 * What an open editor talks to rather than navigates to. They are registered
 * once because they answer with data rather than with a page, so the language
 * prefix has nothing to change about them.
 */
const editing = [
  route("admin/research/:researchId/draft/:draftId/presence", "routes/admin-draft-presence.ts"),
  route("admin/research/:researchId/draft/:draftId/undo/:undoId", "routes/admin-draft-undo.ts"),
  route("admin/research/:researchId/draft/:draftId/comments", "routes/admin-draft-comments.ts"),
  route("admin/research/:researchId/files/upload", "routes/admin-files-upload.ts"),
  route("admin/contents/files/upload", "routes/admin-contents-files-upload.ts"),
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
 * The JSON API. **The addresses come from `app/api/endpoints.ts`**, which is the
 * same list the OpenAPI document is generated from, so a route and its entry in
 * the document cannot describe different addresses.
 *
 * No language prefix: an answer carries both languages.
 */
const api = [
  ...API_ENDPOINTS.map((endpoint) => route(endpoint.path, endpoint.file)),
  route(OPENAPI_PATH, OPENAPI_FILE),
]

export default [
  route("healthz", "routes/healthz.ts"),
  ...auth,
  ...api,
  ...editing,
  ...pages("ja"),
  ...prefix("en", pages("en")),
  route("*", "routes/document.tsx"),
] satisfies RouteConfig
