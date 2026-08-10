import { dblinkListing } from "~/api/pages.server"

import type { Route } from "./+types/api-dblink-listing"

export function loader({ request, params }: Route.LoaderArgs) {
  return dblinkListing(request, params.type)
}
