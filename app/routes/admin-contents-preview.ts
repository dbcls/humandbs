import { articlePreviewAction } from "~/admin/contents.server"

import type { Route } from "./+types/admin-contents-preview"

/**
 * The typed body of an article or an announcement, drawn as its page for the
 * pane beside the form (`components/contents.tsx` の `useArticlePanes`).
 * **An action and nothing else**: it is asked with what the form holds, and
 * there is no page here to open.
 */
export async function action({ request }: Route.ActionArgs) {
  return articlePreviewAction(request)
}
