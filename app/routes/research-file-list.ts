import { researchUrlList } from "~/public/file-lists.server"

import type { Route } from "./+types/research-file-list"

/** Every public file of a published research, one address to a line (`app/files/url-list.ts`). */
export async function loader({ params }: Route.LoaderArgs) {
  return researchUrlList(params.humId)
}
