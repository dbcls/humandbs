import { ReviewScreen } from "~/components/review"
import { messagesFor } from "~/i18n/messages"
import { readLocale } from "~/public/urls"
import { reviewAction, reviewPage } from "~/review/review.server"

import type { Route } from "./+types/admin-draft-review"

/**
 * The link, what came back through it, and what is still open. It answers with
 * a redirect, so the forms work with JavaScript switched off; the editing
 * screens post the same intents to the resource route instead, because they
 * must not navigate away from unsaved work.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  return reviewPage(request, locale, params)
}

export async function action({ request, params }: Route.ActionArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  return reviewAction(request, locale, params, "redirect")
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  const label = loaderData.humLabel ?? messages.admin.review.heading
  return [
    { title: `${label} - ${messages.admin.review.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminDraftReview({ loaderData }: Route.ComponentProps) {
  return <ReviewScreen view={loaderData} />
}
