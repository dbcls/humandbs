import { type RouteConfig, index, prefix, route } from "@react-router/dev/routes"

/**
 * The same pages are registered twice, once without a prefix and once under
 * `/en`, because the language is part of the address and Japanese is the one
 * without a prefix (`app/public/urls.ts`). Registering them under an optional
 * `:lang?` segment would make `/hum0001` — the address DDBJ Search links to —
 * indistinguishable from a language prefix.
 *
 * The catch-all is last and takes what is left: the bare hum labels, the
 * addresses the old Joomla site published, and `/ja/…`, which is the same page
 * as the unprefixed one and redirects to it.
 *
 * Registering a file twice needs an explicit id, and **an id must not contain a
 * slash**: the server build resolves a module from it, so `ja/research` sends it
 * looking for a file that is not there and every route answers 500.
 */
function publicPages(scope: string) {
  return [
    index("routes/home.tsx", { id: `${scope}-home` }),
    route("research/:humId", "routes/research.tsx", { id: `${scope}-research` }),
    route("research/:humId/versions", "routes/research-versions.tsx", { id: `${scope}-versions` }),
    route("research/:humId/:version", "routes/research-version.tsx", { id: `${scope}-version` }),
    route("dataset/:datasetId", "routes/dataset.tsx", { id: `${scope}-dataset` }),
  ]
}

export default [
  route("healthz", "routes/healthz.ts"),
  ...publicPages("ja"),
  ...prefix("en", publicPages("en")),
  route("*", "routes/legacy.tsx"),
] satisfies RouteConfig
