import { draftPageAction } from "~/admin/pages.server"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-draft-page"

/**
 * The draft drawn as its page, for the pane standing beside the form.
 *
 * **It answers with data rather than a page**, so it is registered once and the
 * language it draws in comes from the request rather than from the address: the
 * pane's language is the reader's choice, not the screen's
 * (`app/components/admin.tsx`).
 *
 * It is a POST because what it draws is the content in the form, which has not
 * been saved and does not fit in an address. **Nothing is written.**
 */
export async function action({ request, params }: Route.ActionArgs) {
  const url = new URL(request.url)
  const locale = url.searchParams.get("lang") === "en"
    ? "en"
    : url.searchParams.get("lang") === "ja"
      ? "ja"
      : readLocale(url.pathname).locale
  return draftPageAction(request, locale, params)
}
