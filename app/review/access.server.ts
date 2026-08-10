/**
 * The one place a share token is turned into a draft.
 *
 * **Every path that serves unpublished content to an unauthenticated reader
 * goes through here** — the preview pages, the comment forms, the
 * acknowledgement. A check on the route would not do: a route guard protects a
 * page, and the data behind it is reachable by whatever else asks for it, so
 * the check belongs where the data is fetched.
 *
 * A link that is private, expired, or built on a token that has since been
 * reissued answers exactly as a link that never existed: null, which the pages
 * turn into 404. Saying "this exists but is closed" would confirm the draft to
 * somebody holding a stale address.
 */

import { eq } from "drizzle-orm"

import type { ResearchContent } from "~/content/types"
import type { Executor } from "~/db/client.server"
import { researchDraft } from "~/db/schema"

import { isShareOpen } from "./share"

export interface SharedDraft {
  draftId: string
  researchId: string
  content: ResearchContent
  token: string
}

export async function sharedDraftByToken(
  db: Executor,
  token: string,
): Promise<SharedDraft | null> {
  if (token === "") return null

  const [row] = await db
    .select({
      id: researchDraft.id,
      researchId: researchDraft.researchId,
      content: researchDraft.content,
      shareEnabled: researchDraft.shareEnabled,
      shareExpiresAt: researchDraft.shareExpiresAt,
    })
    .from(researchDraft)
    .where(eq(researchDraft.shareToken, token))
    .limit(1)
  if (row === undefined) return null

  const open = isShareOpen(
    { enabled: row.shareEnabled, expiresAt: row.shareExpiresAt },
    new Date(),
  )
  if (!open) return null

  return { draftId: row.id, researchId: row.researchId, content: row.content, token }
}
