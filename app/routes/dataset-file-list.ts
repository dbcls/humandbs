import { datasetUrlList } from "~/public/file-lists.server"

import type { Route } from "./+types/dataset-file-list"

/** Every public file a published dataset selects, one address to a line (`app/files/url-list.ts`). */
export async function loader({ params }: Route.LoaderArgs) {
  return datasetUrlList(params.datasetId)
}
