import { apiBulk } from "~/api/pages.server"

import type { Route } from "./+types/api-dataset-bulk"

export function loader({ request }: Route.LoaderArgs) {
  return apiBulk(request, "dataset")
}
