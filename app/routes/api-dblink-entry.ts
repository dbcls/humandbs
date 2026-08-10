import { dblinkEntry } from "~/api/pages.server"

import type { Route } from "./+types/api-dblink-entry"

export function loader({ request, params }: Route.LoaderArgs) {
  return dblinkEntry(request, params.type, params.id)
}
