import { type RouteConfig, index, prefix, route } from "@react-router/dev/routes"

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
function publicPages(scope: string) {
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
  ]
}

export default [
  route("healthz", "routes/healthz.ts"),
  ...publicPages("ja"),
  ...prefix("en", publicPages("en")),
  route("*", "routes/document.tsx"),
] satisfies RouteConfig
